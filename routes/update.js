const updateRouter = require('express').Router();
const {
  updateAll,
  updateStatics,
} = require('../controllers/update');

updateRouter.route('/all').get(updateAll);
updateRouter.route('/statistic').get(updateStatics);



module.exports = updateRouter;
