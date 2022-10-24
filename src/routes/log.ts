import { bufferToHex } from "ethereumjs-util";
import { txStatuses } from "../api";
import { apiPerfLogData, txStatusSaver } from "../logger";
import { db } from "../storage/sqliteStorage";
import { getReasonEnumCode, getTransactionObj, getTransactionReceipt } from "../utils";

const express     = require('express');
const router      = express.Router();
const CONFIG      = require('../config');


router.route('/api-stats').get((req: any, res: any) => {
  try {
    for (const [key, value] of Object.entries(apiPerfLogData)) {
      apiPerfLogData[key].tAvg = value.tTotal / value.count
    }
    return res.json(apiPerfLogData).status(200)
  } catch (e) {
    return res.json({error: "Internal Server Error"}).status(500)
  }
})

router.route('/api-stats-reset').get((req: any, res: any) => {
  try{
    for ( const [key,] of Object.entries(apiPerfLogData)){
      delete apiPerfLogData[key]
    }
    return res.json({status: 'ok'}).status(200)
  }catch(e){
    return res.json({error: "Internal Server Error"}).status(500)
  }
})

router.route('/txs')
  .get(async function(req:any, res: any) {  

    try{
      const txs = db.prepare('SELECT * FROM transactions').all();
      res.send({length: txs.length, txs: txs}).status(200);
    }catch(e:any){
      res.send(e).status(500);
    }
  })

router.route('/cleanLogDB')
  .get(async function(req:any, res: any) {  

    try{
      await db.exec('DELETE FROM transactions')
      res.send({success: true}).status(200);
    }catch(e:any){
      res.send(e).status(500);
    }
  })

router.route('/startTxCapture')
  .get(async function(req:any, res: any) {  
    CONFIG.recordTxStatus = true
      res.send("Transaction status recording enabled").status(200);
  })
router.route('/stopTxCapture')
  .get(async function(req:any, res: any) {  
    
    CONFIG.recordTxStatus = false
      res.send("Transaction status recording disabled").status(200);
  })


module.exports = router;
