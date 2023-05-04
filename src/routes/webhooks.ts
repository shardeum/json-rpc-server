import { db } from '../storage/sqliteStorage'
import express from 'express'
export const router = express.Router()
import { CONFIG } from '../config'
import { debug_info } from '../logger'

router.route('/evm_log').post(async function (req: any, res: any) {
})
