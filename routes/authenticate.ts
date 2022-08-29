import * as jwt from 'jsonwebtoken';
const express     = require('express');
const router      = express.Router();
const CONFIG      = require('../config');

router.route('/:passphrase')
  .get(async function(req:any, res: any) {  
    const { passphrase } = req.params
    const payload = { user: 'shardeum-dev' }
    if (passphrase === CONFIG.passphrase){
      // token don't expire, usually this is bad practice
      // for the case being implementing refresh token is overkill 
      // stolen token worst case scenario our debug data ended up being not useful.
      const token = jwt.sign(payload, CONFIG.secret_key);
      res.cookie('access_token', token, {
        httpOnly: false,
        maxAge: 1000 * 60 * 60 * 700 // ~ a month
      }) 
      res.send({message: 'authenticated and authorized for debug api calls'}).status(200)
    }
    res.send({message: 'wrong passphrase'}).status(400)
  })

module.exports = router;
