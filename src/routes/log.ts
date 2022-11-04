import { apiPerfLogData, saveInterfaceStat, txStatusSaver } from "../logger";
import { db } from "../storage/sqliteStorage";
import { getReasonEnumCode, getTransactionObj, getTransactionReceipt } from "../utils";

const express     = require('express');
const router      = express.Router();
const CONFIG      = require('../config');


router.route('/api-stats').get(async(req: any, res: any) => {
  try {
    const timeInputProcessor = (timestamp: string) => {
      const t = timestamp.includes('-') ? timestamp : parseInt(timestamp);
      return new Date(t).getTime();
    }
    const start = req.query.start ? timeInputProcessor(req.query.start) : 1 
    const end = req.query.end ? timeInputProcessor(req.query.end) : Date.now()

    const raw = await db.prepare(`SELECT * FROM interface_stats WHERE timestamp BETWEEN ${start} AND ${end}`).all();

    const stats:any = {}
    for(const entry of raw){
        if(stats[entry.api_name]){
            stats[entry.api_name].tFinals.push(entry.tfinal)
        }
        else{
            stats[entry.api_name] = {
                tMax: 0,
                tMin: 0,
                tAvg: 0,
                tTotal: 0,
                tFinals : [entry.tfinal]
            }
        }
    }

    for(const api_name in stats){
        stats[api_name].tFinals.sort();
        const length = stats[api_name].tFinals.length
        const index = length > 0 ? length - 1 : 0 
        stats[api_name].tMax = stats[api_name].tFinals[index] 
        stats[api_name].tMin = stats[api_name].tFinals[0]
        stats[api_name].count = length

        for(const tfinal of stats[api_name].tFinals){
           stats[api_name].tTotal += tfinal
        }
        stats[api_name].tAvg = stats[api_name].tTotal/stats[api_name].tFinals.length
        delete stats[api_name].tFinals
    }
    const info = {
      date: { 
        start: new Date(start).toString(),
        end: new Date(end).toString()
      },
      stats: stats
    }
    return res.json(info).status(200)
  } catch (e) {
    return res.json(e).status(500)
  }
})

router.route('/cleanStatDB').get(async(req: any, res: any) => {
    try{
      await db.exec('DELETE FROM interface_stats')
      res.send({success: true}).status(200);
    }catch(e:any){
      res.send(e).status(500);
    }
})

router.route('/txs')
  .get(async function(req:any, res: any) {  
    try{
      // this is a very bad security practice !
      // Not enough input sanitization :(
      // Exposed Primary keys :(
      // Should be ok though as long as this endpoint is private and only for debug
      const page = req.query.page || 0
      const max = req.query.max || 1000      
      const cursor:number = page * max;
      const txs = db.prepare(`SELECT * FROM transactions WHERE id > ${cursor} LIMIT ${max}`).all();
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
