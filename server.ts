const jayson = require('jayson');
const url = require('url')
const cors = require('cors');
const connect = require('connect');
const jsonParser = require('body-parser').json;
const express = require('express')
import {methods} from './api'
import { changeNode } from './utils'

const app = express()
const server = new jayson.Server(methods);
const port = 8080

app.use(cors({methods: ['POST']}));
app.use(jsonParser());
app.get('/api/subscribe', (req: any, res: any) => {
    const query = req.query
    if (!query || !query.ip || !query.port) {
        console.log('Invalid ip or port')
        return res.end('Invalid ip or port')
    }
    const ip = query.ip || 'localhost'
    const port = parseInt(query.port) || 9001
    changeNode(ip, port)
    res.end(`Successfully changed to ${ip}:${port}`)
})

app.use(server.middleware());

app.listen(port, (err: any) => {
    if (err) console.log('Unable to start JSON RPC Server', err)
    console.log(`JSON RPC Server listening on port ${port} and chainId is 8080.`)
});
