const updateRouter = require('express').Router();
const {
  updateAll,
  updateStatics,
  updateRecomendations
} = require('../controllers/update');

updateRouter.route('/all').get(updateAll);
updateRouter.route('/recomendations').get(updateRecomendations);
updateRouter.route('/statistic').get(updateStatics);



module.exports = updateRouter;
