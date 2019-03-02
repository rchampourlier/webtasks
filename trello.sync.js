// ## Webtask `trello.sync`
//
// This webtask provides automatic card sync between two Trello boards or lists.
//
// ### Requirements
//
// - This webtask is intended to be triggered by Trello webhooks.
//   You need to configure Trello's webhooks to call on the webtask URL
//   (path is simply `/`).
// - This webtask needs to be capable of performing Trello API calls. For
//   this, you will have to add the following secrets. You can get both
//   [here](https://trello.com/app-key).
//   - `api_key`
//   - `api_token`
//
// - This webtask needs to know the webhook url to add, the list where the
//   card will be copied and the member ID used as a trigger. For
//   this, you will have to add the following metas. (use trello sandbox to
//   get the IDs)
//   - `webhook_URL`
//   - `target_list_ID`
//   - `ctx.meta.ref_member_ID`
//
// ### Task description
//
// #### Trigger conditions
//
// When a specific user is added on a card,
// copy the card to another board
// and add a link between cards
//
// When the specific user is removed from card,
// delete the twin card in another board

/****************************************\
 INITIALIZE EXPRESS APP
\****************************************/
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
app.use(bodyParser.json());

var https = require('https');
var _ = require('lodash');

/****************************************\
 PERFORM TRELLO API CALLS
\****************************************/
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
      if (res.statusCode === 200) {
        onSuccess(dataStr);
      } else {
        onError(res.statusCode + ': ' + dataStr);
      }
    });
  });

  req.on('error', (e) => {
    onError(e);
  });

  req.end();
};

/****************************************\
 WORKFLOW FUNCTIONS
\****************************************/

var linkCard = (ctx, cardID1, cardID2) => {
  trelloAPICall(ctx, 'POST', '/1/cards/' + cardID1 + '/attachments/', {
      url: 'https://trello.com/c/' + cardID2,
    }, () => {
      console.log('trello.sync -- linked card ' + cardID2 + ' to card ' + cardID1);
    }, (error) => {
      console.log('trello.sync -- could not link card ' + cardID2 + ' to card ' + cardID1 + '(' + error + ')');
    });
};

var removeLinkCard = (ctx, cardID1, attachementID) => {
  trelloAPICall(ctx, 'DELETE', '/1/cards/' + cardID1 + '/attachments/' + attachementID, {}
    , () => {
      console.log('trello.sync -- removed link ' + attachementID + ' from card ' + cardID1);
    }, (error) => {
      console.log('trello.sync -- could not remove link ' + attachementID + ' from card ' + cardID1 + '(' + error + ')');
    });
};

// TODO: only create webhook if it doesn't exists
var webhookCard = (ctx, cardID) => {
  trelloAPICall(ctx, 'POST', '/1/webhooks/', {
      callbackURL: ctx.meta.webhook_URL,
      idModel: cardID
    }, () => {
      console.log('trello.sync -- created wekhook on card card ' + cardID);
    }, (error) => {
      console.log('trello.sync -- could not create webhook on card ' + cardID + '(' + error + ')');
    });
};

var getWebhooksForModel = (ctx, modelID, cb) => {
  // get attached cards
  trelloAPICall(ctx, 'GET', '/1/tokens/' + ctx.secrets.api_token + '/webhooks', {},
   (webhooksData) => {
    const webhooks = JSON.parse(webhooksData);
    const modelWebhooks = webhooks.filter(webhook => (webhook.idModel === modelID && webhook.callbackURL === ctx.meta.webhook_URL));
    modelWebhooks.forEach(webhook => {
      var webhookID = webhook.id;
      cb(ctx, modelID, webhookID);
    });
  }, (error) => {
    console.log('trello.sync -- could not get webhooks for ' + modelID + '(' + error + ')');
  });
};

var removeWebhookCard = (ctx, cardID, webhookID) => {
  trelloAPICall(ctx, 'DELETE', '/1/webhooks/' + webhookID, {}
    , () => {
      console.log('trello.sync -- removed webhook ' + webhookID + ' for card ' + cardID);
    }, (error) => {
      console.log('trello.sync -- could not remove webhook ' + webhookID + ' fror card ' + cardID + '(' + error + ')');
    });
};

var getSistersCards = (ctx, cardID, cb) => {
  // get attached cards
  trelloAPICall(ctx, 'GET', '/1/cards/' + cardID + '/attachments', {
    fields: 'id,url'
  }, (attachementsData) => {
    const attachments = JSON.parse(attachementsData);
    const cardsAttachments = attachments.filter(attachment => /https:\/\/trello\.com\/c\/(\w*)/.test(attachment.url));
    cardsAttachments.forEach(attachment => {
      var copyID = attachment.url.replace('https://trello.com/c/', '');
      var attachmentID = attachment.id;
      cb(ctx, cardID, copyID, attachmentID);
    });
  }, (error) => {
    console.log('trello.sync -- could not get attachements for ' + cardID + '(' + error + ')');
  });
};

var removeAttachmentAndArchive = (ctx, cardID, copyID, attachmentID) => {
  getWebhooksForModel(ctx, copyID, removeWebhookCard);
  getWebhooksForModel(ctx, cardID, removeWebhookCard);
  // Archive the linked card and remove link
  trelloAPICall(ctx, 'PUT', '/1/cards/' + copyID, {
    closed: true
  }, () => {
    console.log('trello.sync -- archived card ' + copyID);
    removeLinkCard(ctx, cardID, attachmentID);
  }, (error) => {
    console.log('trello.sync -- could not archive the card ' + copyID + '(' + error + ')');
  });

};


/****************************************\
 EXPRESS ENDPOINTS
\****************************************/

app.head('/', function(req, res) {
  console.log('trello.sync -- HEAD /');
  res.sendStatus(200);
});

app.post('/', function (req, res) {
  const ctx = req.webtaskContext;
  console.log('trello.sync -- POST /');

  // Main workflow code
  const body = req.body;
  const actionType = body.action.type;
  const memberID = body.action.data.idMember;
  const cardID = body.action.data.card.id;

  // Trigger:
  //   - new member : "addMemberToCard"
  //   - the member is the ctx.meta.ref_member_ID
  if (actionType === 'addMemberToCard' &&
      memberID === ctx.meta.ref_member_ID) {

    // Copy card to the target list
    trelloAPICall(ctx, 'POST', '/1/cards/', {
      idList: ctx.meta.target_list_ID,
      idCardSource: cardID,
      pos: 'top',
      keepFromSource: ''
    }, (copyData) => {
      console.log('trello.sync -- copied card ' + cardID);

      var copyID = JSON.parse(copyData).id;
      // cross link the cards
      linkCard(ctx, cardID, copyID);
      linkCard(ctx, copyID, cardID);
      // create webhooks
      webhookCard(ctx, cardID);
      webhookCard(ctx, copyID);
    }, (error) => {
      console.log('trello.sync -- could not copy the card ' + cardID + '(' + error + ')');
    });
  }

  // Trigger:
  //   - removed member : "removeMemberFromCard"
  //   - the member is the ctx.meta.ref_member_ID
  if (actionType === 'removeMemberFromCard' &&
      memberID === ctx.meta.ref_member_ID) {

    // Get the attached card ID and the attachement ID and
    // remove the attachment and archive card
    getSistersCards(ctx, cardID, removeAttachmentAndArchive);
  }


  res.sendStatus(200);
});

/****************************************\
 PUBLISH EXPRESS ENDPOINTS
\****************************************/
var Webtask = require('webtask-tools');
module.exports = Webtask.fromExpress(app);
