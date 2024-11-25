const callsRouter = require('express').Router();
const {
  getCalls, incrCalls, updateCalls, testCsv
} = require('../controllers/calls');

callsRouter.route('/').get(getCalls);
callsRouter.route('/incr').get(incrCalls);
callsRouter.route('/update-calls').get(updateCalls);
callsRouter.route('/testCsv').get(testCsv);

module.exports = callsRouter;
