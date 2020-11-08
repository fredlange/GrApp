import {ClusterLink, IncomingMessage, LinkEvents, RequestMessage, ResponseMessage} from "./link/ClusterLink";
import {EventEmitter} from "events";
import {ComponentRoles} from "../cluster-orator/app";
import {IComponentRegistry} from "./cluster.registry";

interface ClusterManagerConfig {
    appName: string
    link: ClusterLink,
    role: ComponentRoles,
    componentRegistry: IComponentRegistry
}

/*
Events emitted by the ClusterManager EventEmitter
 */
export enum ClusterEvents {
    NOTIFY_MANAGER = "NOTIFY_MANAGER",
    MESSAGE_FROM_SERVER = "MESSAGE_FROM_SERVER",
    NEW_PEER = 'NEW_PEER',
    STATE_REHYDRATE = "STATE_REHYDRATE"
}

export class ClusterManager extends EventEmitter {

    private readonly appName: string
    private readonly link: ClusterLink
    protected peers: IComponentRegistry
    private readonly role: ComponentRoles

    constructor(config: ClusterManagerConfig) {
        super()
        this.appName = config.appName
        this.peers = config.componentRegistry
        this.link = config.link
        this.role = config.role

        this.link.on(LinkEvents.PING, (incMsg: IncomingMessage) => {
            this.link.sendToServer(JSON.stringify({
                id: incMsg.ref,
                type: 'RESPONSE',
                component: {
                    name: this.appName
                },
                payload: {
                    status: 'OK'
                }
            }))

        })

        this.link.onMessage(msg => {
            if (!msg.isTyped()) {

                console.log('Message', msg)

                // Untyped only on message from server!
                // Multiple peers such as initial connect
                if (Array.isArray(msg.payload)) {
                    this.emit(ClusterEvents.STATE_REHYDRATE, msg.payload)
                    this.peers.pushMultipleComponents(msg.payload)
                }
                // Single component, on continues connection
                else {
                    this.emit(ClusterEvents.NEW_PEER, msg.payload)
                    this.peers.pushOnNewComponent({
                        port: msg.sender.port,
                        name: msg.payload.appName,
                        schema: msg.payload.schemaSource
                    })
                }
            }
        })
    }

    respondOnQuery(fn: (msg: IncomingMessage) => Promise<ResponseMessage>) {
        this.link.on(LinkEvents.QUERY, (msg: IncomingMessage) =>
            fn(msg).then(p => this.link.sendMessage(msg.sender.port, p)))
    }

    connectToCluster(payload: any) {
        this.link.sendToServer(JSON.stringify({
            component: {
                name: this.appName,
                role: this.role
            },
            payload: payload
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
    }

    /*
    Temporary exposure of sendMessage. Should not be used later on me thinks...
     */
    _send(port: number, message: any) {
        this.link.sendMessage(port, message)
    }

}