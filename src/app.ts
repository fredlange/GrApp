import {GrApp} from "./GrApp";


// Construct a schema, using GraphQL schema language
let source = `
type Query {
    iHate: String
    seriousHatred: String
}
`;

// The root provides a resolver function for each API endpoint
const root = {
    iHate: async () => {
        return 'Gesle!!'
    },
    seriousHatred: async () => {
        const poop = await app.query(`{ iHate }`)
        console.log('poop', poop)

        return 'ARGH ' + poop.data.iHate;

    }
};

const app = new GrApp({
    name: 'theFirstApp',
    source: source,
    rootResolver: root
})





