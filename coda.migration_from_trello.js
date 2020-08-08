// This webtask performs a migration of the PRM workflow from
// Trello to Coda. It only performs the contents from the 
// Trello board to a Coda doc and does not setup the doc.
//
// ### Requirements
//
// - This webtask is intended to be triggered manually.
// - This webtask requires Trello API key and token. Get them
//   [here](https://trello.com/app-key).
//   - `trello_key`
//   - `trello_token`
// - It also requires a Coda API token. Get it 
//   [here](https://coda.io/account).
//   - `coda_token`
//
// You can deploy this webtask with:
// `wt-cli create --secret coda_token=$(pass coda/token) --secret trello_key=$(pass trello/key) --secret trello_token=$(pass trello/token) --name coda.migration_from_trello coda.migration_from_trello.js`

const https = require('https');
const _ = require('lodash');

var serializeQueryString = obj => {
  var str = [];
  for (var p in obj)
    if (obj.hasOwnProperty(p)) {
      str.push(encodeURIComponent(p) + '=' + encodeURIComponent(obj[p]));
    }
  return str.join('&');
};

var trelloAPICall = (ctx, verb, path, params, onSuccess, onError) => {
  var defaultParams = {
    key: ctx.secrets.trello_key,
    token: ctx.secrets.trello_token,
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
    method: verb,
  };

  const req = https.request(options, res => {
    var dataStr = '';
    res.on('data', chunk => {
      dataStr += chunk;
    });

    res.on('end', function () {
      if (res.statusCode >= 200 && res.statusCode <= 299) {
        onSuccess(dataStr);
      } else {
        onError(res.statusCode + ': ' + dataStr);
      }
    });
  });

  req.on('error', e => {
    onError(e);
  });

  req.end();
};

var codaAPICall = (ctx, verb, path, params, onSuccess, onError) => {
  var defaultParams = {
  };
  params = _.merge(defaultParams, params);
  var queryString = serializeQueryString(params);

  if (queryString.length > 0) {
    path += '?' + queryString;
  }

  const options = {
    hostname: 'coda.io',
    port: 443,
    path: path,
    method: verb,
    headers: { 'Authorization': 'Bearer ' + ctx.secrets.coda_token }
  };

  const req = https.request(options, res => {
    var dataStr = '';
    res.on('data', chunk => {
      dataStr += chunk;
    });

    res.on('end', function () {
      if (res.statusCode >= 200 && res.statusCode <= 299) {
        onSuccess(dataStr);
      } else {
        onError(res.statusCode + ': ' + dataStr);
      }
    });
  });

  req.on('error', e => {
    onError(e);
  });

  req.end();
};

const log = data => {
  console.log(data);
};

/**
* @param context {WebtaskContext}
*/
module.exports = function(ctx, cb) {
  // List board
  trelloAPICall(ctx, 'GET', '/1/members/me/boards', {}, log, log );

  // Find PRM board
  let BOARD_ID = '57af3d3bf86d0a23b57b3ace';

  // Get all cards in the PRM board

  // List a board's lists
  trelloAPICall(ctx, 'GET', '/1/boards/' + BOARD_ID + '/lists', {}, log, log);

  // For each list, get all cards.
  // For each card, create a record in Coda PRM
  

  // List a list's cards
  //trelloAPICall(ctx, 'GET', '/1/lists/' + 'LIST_ID' + '/cards', {}, log, log );

  // Test Coda
  codaAPICall(ctx, 'GET', '/apis/v1beta1/docs', {}, log, log);

  cb(null, {});
};
