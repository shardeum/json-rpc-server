import WebSocket from "ws";
import { methods } from "../api";
import { logSubscriptionList } from "./Clients";
import * as crypto from 'crypto';

export const onConnection = async (socket: WebSocket.WebSocket) => {
  socket.on('message', (message: string) => {
    // console.log(`Received message: ${message}`);

    const request = JSON.parse(message);
    // console.log(request);

    if(request.jsonrpc !== '2.0') socket.send("Rpc version does not satisfy");
    if(!request.method) socket.send("Method is not specified");
    if(!request.params) socket.send("Params not found");

    const callback = async (err: any, result: any) => {
      if(err){
        const err_res_obj = {
          id: request.id,
          jsonrpc: '2.0',
          error: {
            message: err,
            code: -1
          }
        }
        socket.send(JSON.stringify(err_res_obj));
        return
      }
      const res_obj = {
        id: request.id,
        jsonrpc: '2.0',
        result: result
      }
      socket.send(JSON.stringify(res_obj));
      return
    }

    const method_name = request.method as string
     if (!methods[method_name as keyof typeof methods]) {
      socket.send(JSON.stringify({
          id: request.id,
          jsonrpc: '2.0',
          error: {
            message: "Method does not exist",
            code: -1
          }
      }));
      return
     }
       if(method_name === 'eth_subscribe'){
         // in this case we need to keep track of a connection
         // We will NOT keep track of connection for other interface call 
         let subscription_id = crypto.randomBytes(32).toString('hex')
         subscription_id = '0x'+ crypto.createHash('sha256')
                                      .update(subscription_id).digest().toString('hex');
         request.params[10] = subscription_id
          logSubscriptionList.list.set(subscription_id, socket);
       }
       // call interface handler
       methods[method_name as keyof typeof methods](request.params, callback);
  });

  socket.on('disconnect', () => {
    console.log('A client disconnected!');
  });
}
