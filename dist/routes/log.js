"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
Object.defineProperty(exports, "__esModule", { value: true });
var logger_1 = require("../logger");
var sqliteStorage_1 = require("../storage/sqliteStorage");
var express = require('express');
var router = express.Router();
var CONFIG = require('../config');
router.route('/api-stats').get(function (req, res) {
    var e_1, _a;
    try {
        try {
            for (var _b = __values(Object.entries(logger_1.apiPerfLogData)), _c = _b.next(); !_c.done; _c = _b.next()) {
                var _d = __read(_c.value, 2), key = _d[0], value = _d[1];
                logger_1.apiPerfLogData[key].tAvg = value.tTotal / value.count;
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_1) throw e_1.error; }
        }
        return res.json(logger_1.apiPerfLogData).status(200);
    }
    catch (e) {
        return res.json({ error: "Internal Server Error" }).status(500);
    }
});
router.route('/api-stats-reset').get(function (req, res) {
    var e_2, _a;
    try {
        try {
            for (var _b = __values(Object.entries(logger_1.apiPerfLogData)), _c = _b.next(); !_c.done; _c = _b.next()) {
                var _d = __read(_c.value, 1), key = _d[0];
                delete logger_1.apiPerfLogData[key];
            }
        }
        catch (e_2_1) { e_2 = { error: e_2_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_2) throw e_2.error; }
        }
        return res.json({ status: 'ok' }).status(200);
    }
    catch (e) {
        return res.json({ error: "Internal Server Error" }).status(500);
    }
});
router.route('/txs')
    .get(function (req, res) {
    return __awaiter(this, void 0, void 0, function () {
        var txs;
        return __generator(this, function (_a) {
            try {
                txs = sqliteStorage_1.db.prepare('SELECT * FROM transactions').all();
                res.send({ length: txs.length, txs: txs }).status(200);
            }
            catch (e) {
                res.send(e).status(500);
            }
            return [2 /*return*/];
        });
    });
});
router.route('/cleanLogDB')
    .get(function (req, res) {
    return __awaiter(this, void 0, void 0, function () {
        var e_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, sqliteStorage_1.db.exec('DELETE FROM transactions')];
                case 1:
                    _a.sent();
                    res.send({ success: true }).status(200);
                    return [3 /*break*/, 3];
                case 2:
                    e_3 = _a.sent();
                    res.send(e_3).status(500);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
});
router.route('/startTxCapture')
    .get(function (req, res) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            CONFIG.recordTxStatus = true;
            res.send("Transaction status recording enabled").status(200);
            return [2 /*return*/];
        });
    });
});
router.route('/stopTxCapture')
    .get(function (req, res) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            CONFIG.recordTxStatus = false;
            res.send("Transaction status recording disabled").status(200);
            return [2 /*return*/];
        });
    });
});
module.exports = router;
