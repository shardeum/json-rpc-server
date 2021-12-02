const jayson = require('jayson');
const cors = require('cors');
const connect = require('connect');
const jsonParser = require('body-parser').json;
import {methods} from './api'

const app = connect();
// create a server
const server = new jayson.Server(methods);

app.use(cors({ methods: ['POST'] }));
app.use(jsonParser());
app.use(server.middleware());

app.listen(8080, (err: any) => {
    if (err) console.log('Unable to start JSON RPC Server', err)
    console.log('JSON RPC Server listening on port 8454')
});
