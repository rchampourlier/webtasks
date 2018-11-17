// This webtask may be used to test the Trello API when building
// another webtask.
//
// ### Requirements
//
// - This webtask is intended to be triggered manually from the webtask
//   editor.
// - This webtask needs to be capable of performing Trello API calls. For
//   this, you will have to add the following secrets. You can get both
//   [here](https://trello.com/app-key).
//   - `api_key`
//   - `api_token`

const https = require('https');
const _ = require('lodash');

var serializeQueryString = (obj) => {
  var str = [];
  for(var p in obj)
    if (obj.hasOwnProperty(p)) {
      str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
    }
  return str.join("&");
};

var trelloAPICall = (ctx, verb, path, params, onSuccess, onError) => {
  var defaultParams = {
    key: ctx.secrets.api_key,
    token: ctx.secrets.api_token,
  };
  params = _.merge(defaultParams, params);
  var queryString = serializeQueryString(params);

  if (queryString.length > 0) {
    path += '?' + queryString;
  }

  const options = {
    hostname: 'api.trello.com',
    port: 443,
    path: path,
    method: verb
  };

  const req = https.request(options, (res) => {
    var dataStr = '';
    res.on('data', (chunk) => {
      dataStr += chunk;
    });

    res.on('end', function () {
      onSuccess(dataStr);
    });
  });

  req.on('error', (e) => {
    onError(e);
  });

  req.end();
};

const log = (data) => { console.log(data); };

/**
* @param context {WebtaskContext}
*/
module.exports = function(ctx, cb) {
  // List boards
  //trelloAPICall(ctx, 'GET', '/1/members/me/boards', {}, log, log );

  // List a board's lists
  //trelloAPICall(ctx, 'GET', '/1/boards/' + 'BOARD_ID' + '/lists', {}, log, log );

  // List a list's cards  
  //trelloAPICall(ctx, 'GET', '/1/lists/' + 'LIST_ID' + '/cards', {}, log, log );

  // Copy a card at the top of a list
  /*trelloAPICall(ctx, 'POST', '/1/cards/', {
    idList: 'LIST_ID',
    pos: 'top',
    idCardSource: 'CARD_ID',
    keepFromSource: 'checklists,labels,attachments'
  }, log, log );*/

  // List webhooks
  //trelloAPICall(ctx, 'GET', '/1/tokens/' + ctx.secrets.api_token + '/webhooks', {}, log, log );

  // Create a new webhook
  /*trelloAPICall(ctx, 'POST', '/1/webhooks', {
    callbackURL: 'CALLBACK_URL',
    idModel: 'MODEL_ID',
    description: 'Webtask.io webhook'
  }, log, log );*/

  // List webhooks
  //trelloAPICall(ctx, 'GET', '/1/tokens/' + ctx.secrets.api_token + '/webhooks', {}, log, log);

  // Delete webhook
  //trelloAPICall(ctx, 'DELETE', '/1/webhooks/' + 'WEBHOOK_ID', {}, log, log);

  cb(null, {});
};
