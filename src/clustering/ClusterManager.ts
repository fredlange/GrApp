import {ClusterLink, IncomingMessage, LinkEvents, RequestMessage, ResponseMessage} from "./link/ClusterLink";
import {EventEmitter} from "events";
import {Component, IComponentRegistry} from "./cluster.registry";
import {RequestTimeoutError} from "./link/ExchangeableLink";
import {VerboseLogging} from "../logging/verbose.logger";
import {Graphlet} from "../Graphlet";

interface ClusterManagerConfig {
    appName: string
    link: ClusterLink,
    role: Graphlet.Role,
    componentRegistry: IComponentRegistry
}

/*
Events emitted by the ClusterManager EventEmitter
 */
export enum ClusterEvents {

    /*
    Emitted when a new component is pushed into registry successfully
     */
    NEW_COMPONENT = 'NEW_COMPONENT',

    /*
    Emitted when a new component sends itself to the orator
     */
    CONNECT_AS_NEW_COMPONENT = 'CONNECT_AS_NEW_COMPONENT',

    /*
    Emitted when a state rehydration occurs which should
    wipe all state and use the latest state from the payload
     */
    STATE_REHYDRATE = "STATE_REHYDRATE",

    /*
    Emitted when the cluster  state is rehydrated successfully
     */
    STATE_REHYDRATED = "STATE_REHYDRATED",

    /*
    Emitted when a new component needs to be pushed into the registry
     */
    NEW_COMPONENT_IN_CLUSTER = "NEW_COMPONENT_IN_CLUSTER",

    /*
    Emitted when a component is unresponsive and should be removed from registry
     */
    UNRESPONSIVE_COMPONENT = 'UNRESPONSIVE_COMPONENT'
}

export class ClusterManager extends EventEmitter {

    private readonly appName: string
    private readonly link: ClusterLink
    protected peers: IComponentRegistry
    private readonly role: Graphlet.Role

    constructor(config: ClusterManagerConfig) {
        super()
        this.appName = config.appName
        this.peers = config.componentRegistry
        this.link = config.link
        this.role = config.role

        this.link.on(LinkEvents.PING, (incMsg: IncomingMessage) => {
            VerboseLogging.debug('Ping received, responding...')
            this.link.sendToServer(JSON.stringify({
                id: incMsg.ref,
                type: LinkEvents.REPLY,
                component: {
                    name: this.appName
                },
                payload: {
                    status: 'OK'
                }
            }))

        })

        // Re emit the message as a event from the message type
        this.link.onMessage((msg => this.emit(msg.type, msg)))


        this.on(ClusterEvents.NEW_COMPONENT_IN_CLUSTER, msg => {
            this.peers.pushOnNewComponent(msg.payload)

            this.emit(ClusterEvents.NEW_COMPONENT, {
                schemaSource: msg.payload.schema,
                name: msg.payload.name,
            })
        })

        this.on(ClusterEvents.STATE_REHYDRATE, payload => {
            VerboseLogging.info('Rehydrating state', payload.payload)
            const comps = payload.payload.map(p => ({
                name: p.name,
                port: p.port,
                schema: p.state.schemaSource
            } as Component))

            this.peers.rehydrateRegistry(comps)

            this.emit(ClusterEvents.STATE_REHYDRATED, this.peers)

        })
    }

    respondOnQuery(fn: (msg: IncomingMessage) => Promise<ResponseMessage>) {
        this.link.on(LinkEvents.QUERY, (msg: IncomingMessage) =>
            fn(msg).then(p => this.link.sendMessage(msg.sender.port, p)))
    }

    connectToCluster(payload: any) {
        this.link.sendToServer(JSON.stringify({
            type: ClusterEvents.CONNECT_AS_NEW_COMPONENT,
            payload: {
                component: {
                    name: this.appName,
                    role: this.role
                },
                ...payload
            }
        }))
    }


    /*
    Temporary exposure of exchange. Should not actually be used
     */
    _exchange(name: string, payload: any, type: LinkEvents = LinkEvents.QUERY): Promise<any> {

        let peer = this.peers.getComponentByName(name);
        const msg = new RequestMessage(peer, {
            type: type,
            payload: payload
        })

        return this.link.exchange(peer.port, msg)
            /*
            This is a low tolerance solution for removing components
            when they do not respond. This should be changed into something
            that will retry X times before removing a component, or change the
            solution in full
             */
            .catch(e => {
                if (e instanceof RequestTimeoutError)
                    this.emit(ClusterEvents.UNRESPONSIVE_COMPONENT, {name: name})
            })
    }

    /*
    Temporary exposure of sendMessage. Should not be used later on me thinks...
     */
    _send(port: number, message: any) {
        this.link.sendMessage(port, message)
    }

}