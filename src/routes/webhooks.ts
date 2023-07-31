import express from 'express'
export const router = express.Router()
import { CONFIG } from '../config'
import { subscriptionEventEmitter } from '../websocket'
import { logSubscriptionList } from '../websocket/Clients'

router.route('/evm_log').post(async function (req: any, res: any) {
  // try{
  //
  //   const logs = req.body.logs;
  //   const relevant_subscribers = req.body.subscribers;
  //
  //   for(const subscriber_id of relevant_subscribers){
  //    subscriptionEventEmitter.emit('evm_log_received', logs, subscriber_id);
  //   }
  res.json().status(200)
  // }catch(e: any){
  //   res.json().status(500);
  // }
})
