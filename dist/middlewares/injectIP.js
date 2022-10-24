"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var util = require('util');
var CONFIG = require('../config');
var injectIP = function (req, res, next) {
    if (req.body.method === 'eth_sendRawTransaction' && CONFIG.recordTxStatus)
        req.body.params[1000] = req.ip;
    next();
    return;
};
exports.default = injectIP;
