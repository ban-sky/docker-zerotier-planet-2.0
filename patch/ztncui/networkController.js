/*
  ztncui - ZeroTier network controller UI
  Copyright (C) 2017-2021  Key Networks (https://key-networks.com)
  Licensed under GPLv3 - see LICENSE for details.
*/

const fs = require('fs');
const path = require('path');
const storage = require('node-persist');
const zt = require('./zt');
const { isIP, isValidCidr, ipInCidr } = require('../ip');

// Member display names live outside the immutable application tree.
const storageDir = process.env.ZTNCUI_STORAGE || path.join(__dirname, '..', 'etc', 'storage');
storage.initSync({ dir: storageDir });

// Only these templates may be selected through the generic /:object routes.
const NETWORK_OBJECT_VIEWS = new Set(['private', 'routes', 'ipAssignmentPools', 'dns', 'v4AssignMode', 'v6AssignMode']);
const MEMBER_OBJECT_VIEWS = new Set(['ipAssignments']);

// Translate a user-visible string when the i18n middleware is installed; fall
// back to the key so the UI still renders when it is not.
function msg(req, key, vars) {
  return req.t ? req.t(key, vars) : key;
}

// Browser-tab titles for the generic network/member object views.
function objectTitle(req, object, network) {
  const keys = {
    private: 'private.title',
    routes: 'btn.routes',
    ipAssignmentPools: 'btn.assignmentPools',
    v4AssignMode: 'v4.title',
    v6AssignMode: 'v6.title',
    ipAssignments: 'page.ipAssignments'
  };
  if (object === 'dns') return 'DNS';
  if (object === 'ipAssignments' && network && network.name) {
    return msg(req, 'page.ipAssignmentsNamed', { name: network.name });
  }
  return keys[object] ? msg(req, keys[object]) : object;
}

async function get_network_with_members(nwid) {
  const [network, peers, members] = await Promise.all([
    zt.network_detail(nwid),
    zt.peers(),
    zt.members(nwid)
      .then(member_ids => {
        // Fix weird data returned by ZeroTier 1.12
        if (Array.isArray(member_ids)) {
          let obj = {};
          for (let id of member_ids) {
            let key = Object.keys(id)[0];
            let value = Object.values(id)[0];
            obj[key] = value;
          }
          member_ids = obj;
        }

        return Promise.all(
          Object.keys(member_ids)
            .map(id => Promise.all([
              zt.member_detail(nwid, id),
              storage.getItem(id)
            ]))
        );
      }).then(results => results.map(([member, name]) => {
        member.name = name || '';
        return member;
      }))
  ]);
  for (const member of members) {
    member.peer = peers.find(x => x.address === member.address);
    if (!Array.isArray(member.ipAssignments)) member.ipAssignments = [];
  }
  return {network, members};
}

async function get_network_member(nwid, memberid) {
  const [network, member, peer, name] = await Promise.all([
    zt.network_detail(nwid),
    zt.member_detail(nwid, memberid),
    zt.peer(memberid),
    storage.getItem(memberid)
  ]);
  member.name = name || '';
  member.peer = peer;
  return {network, member};
}

// ZT network controller home page
exports.index = async function(req, res) {
  const navigate =
    {
      active: 'controller_home',
    }

  try {
    const zt_status = await zt.get_zt_status();
    res.render('index', {title: 'ztncui', navigate: navigate, zt_status});
  } catch (err) {
    res.render('index', {title: 'ztncui',
                      navigate: navigate, error: msg(req, 'msg.ztStatusFailed', { err })});
  }
};

// Display list of all networks on this ZT network controller
exports.network_list = async function(req, res) {
  const navigate =
    {
      active: 'networks',
    }

  try {
    const networks = await zt.network_list();
    res.render('networks', {title: msg(req, 'page.networks'), navigate: navigate, networks: networks});
  } catch (err) {
    res.render('networks', {title: msg(req, 'page.networks'), navigate: navigate, error: msg(req, 'msg.networksListFailed', { err })});
  }
};

// Display detail page for specific network
exports.network_detail = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: '/controller/networks'
    }

  try {
    const [
      {network, members},
      zt_address
    ] = await Promise.all([
      get_network_with_members(req.params.nwid),
      zt.get_zt_address()
    ]);
    res.render('network_detail', {title: msg(req, 'page.network', { name: network.name }), navigate: navigate, network: network, members: members, zt_address: zt_address});
  } catch (err) {
    res.render('network_detail', {title: msg(req, 'page.networkDetail'), navigate: navigate, error: msg(req, 'msg.networkDetailFailed', { nwid: req.params.nwid, err })});
  }
};

// Display Network create form on GET
exports.network_create_get = function(req, res) {
  const navigate =
    {
      active: 'add_network',
    }

  res.render('network_create', {title: msg(req, 'page.createNetwork'), navigate: navigate});
};

// Handle Network create on POST
exports.network_create_post = async function(req, res) {
  const navigate =
    {
      active: 'add_network',
    }

  req.checkBody('name', msg(req, 'msg.networkNameRequired')).notEmpty();

  req.sanitize('name').trim();

  const errors = req.validationErrors();

  let name = { name: req.body.name };

  if (errors) {
    res.render('network_create', {title: msg(req, 'page.createNetwork'), navigate: navigate, name: name, errors: errors});
    return;
  } else {
    try {
      const network = await zt.network_create(name);
      res.redirect('/controller/network/' + network.nwid);
    } catch (err) {
      res.render('network_create', {title: msg(req, 'page.createNetwork'), navigate: navigate, name: name, error: msg(req, 'msg.networkCreateFailed', { name: name.name })});
    }
  }
};

// Display Network delete form on GET
exports.network_delete_get = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: '/controller/networks'
    }

  try {
    const network = await zt.network_detail(req.params.nwid);
    res.render('network_delete', {title: msg(req, 'page.deleteNetwork'), navigate: navigate,
                                    nwid: req.params.nwid, network: network});
  } catch (err) {
    res.render('network_delete', {title: msg(req, 'page.deleteNetwork'), navigate: navigate, error: msg(req, 'msg.networkResolveFailed', { nwid: req.params.nwid, err })});
  }
};

// Handle Network delete on POST
exports.network_delete_post = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: '/controller/networks'
    }

  try {
    const network = await zt.network_delete(req.params.nwid);
    res.render('network_delete', {title: msg(req, 'page.deleteNetwork'), navigate: navigate, network: network});
  } catch (err) {
    res.render('network_delete', {title: msg(req, 'page.deleteNetwork'), navigate: navigate, error: msg(req, 'msg.networkDeleteFailed', { nwid: req.params.nwid, err })});
  }
};

// Network object GET
exports.network_object = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  if (!NETWORK_OBJECT_VIEWS.has(req.params.object)) {
    return res.status(404).render('error', { title: msg(req, 'page.notFound'), navigate, message: msg(req, 'msg.notFound'), error: {} });
  }

  try {
    const network = await zt.network_detail(req.params.nwid);
    navigate.whence = '/controller/network/' + network.nwid;
    res.render(req.params.object, {title: objectTitle(req, req.params.object, network), navigate: navigate, network: network});
  } catch (err) {
    res.status(502).render('error', {title: msg(req, 'page.networkError'), navigate: navigate, message: msg(req, 'msg.networkObjectResolveFailed', { nwid: req.params.nwid }), error: {}});
  }
}

// Handle Network rename form on POST
exports.name = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: '/controller/networks'
    }

  req.checkBody('name', msg(req, 'msg.networkNameRequired')).notEmpty();
  req.sanitize('name').trim();

  const errors = req.validationErrors();

  let name = { name: req.body.name };

  if (errors) {
    console.error("network name validation errors", errors);
  } else {
    try {
      const network = await zt.network_object(req.params.nwid, name);
    } catch ( err) {
      console.error("Error renaming network " + req.params.nwid, err);
    }
  }
  res.redirect('/controller/network/' + req.params.nwid);
};

// ipAssignmentPools POST
exports.ipAssignmentPools = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  req.checkBody('ipRangeStart', msg(req, 'msg.ipRangeStartRequired')).notEmpty();
  req.checkBody('ipRangeStart', msg(req, 'msg.ipRangeStartInvalid')).isIP();
  req.sanitize('ipRangeStart').trim();
  req.checkBody('ipRangeEnd', msg(req, 'msg.ipRangeEndRequired')).notEmpty();
  req.checkBody('ipRangeEnd', msg(req, 'msg.ipRangeEndInvalid')).isIP();
  req.sanitize('ipRangeEnd').trim();

  const errors = req.validationErrors();

  const ipAssignmentPool =
    {
      ipRangeStart: req.body.ipRangeStart,
      ipRangeEnd: req.body.ipRangeEnd
    };

  if (errors) {
    try {
      const network = await zt.network_detail(req.params.nwid);
      navigate.whence = '/controller/network/' + network.nwid;
      res.render('ipAssignmentPools', {title: msg(req, 'btn.assignmentPools'), navigate: navigate, ipAssignmentPool: ipAssignmentPool, network: network, errors: errors});
    } catch (err) {
      res.render('ipAssignmentPools', {title: msg(req, 'btn.assignmentPools'), navigate: navigate, error: msg(req, 'msg.poolsResolveFailed', { nwid: req.params.nwid, err })});
    }
  } else {
    try {
      const network = await zt.ipAssignmentPools(req.params.nwid, ipAssignmentPool, 'add');
      navigate.whence = '/controller/network/' + network.nwid;
      res.render('ipAssignmentPools', {title: msg(req, 'btn.assignmentPools'), navigate: navigate, ipAssignmentPool: ipAssignmentPool, network: network});
    } catch (err) {
      res.render('ipAssignmentPools', {title: msg(req, 'btn.assignmentPools'), navigate: navigate, error: msg(req, 'msg.poolsApplyFailed', { nwid: req.params.nwid, err })});
    }
  }
}

// routes POST
exports.routes = async function (req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  req.checkBody('target', msg(req, 'msg.targetRequired')).notEmpty();
  req.sanitize('target').trim();
  req.checkBody('target', msg(req, 'msg.targetInvalidCidr'))
    .custom(value => isValidCidr(value));
  req.checkBody('via', msg(req, 'msg.gatewayInvalid')).optional({ checkFalsy: true }).isIP();
  req.sanitize('via').trim();
  if (! req.body.via) {
    req.body.via = null;
  }

  const errors = req.validationErrors();

  const route =
    {
      target: req.body.target,
      via: req.body.via
    };

  if (errors) {
    try {
      const network = await zt.network_detail(req.params.nwid);
      navigate.whence = '/controller/network/' + network.nwid;
      res.render('routes', {title: msg(req, 'btn.routes'), navigate: navigate, route: route, network: network, errors: errors});
    } catch (err) {
      res.render('routes', {title: msg(req, 'btn.routes'), navigate: navigate, error: msg(req, 'msg.routeResolveFailed')});
    }
  } else {
    try {
      const network = await zt.routes(req.params.nwid, route, 'add');
      navigate.whence = '/controller/network/' + network.nwid;
      res.render('routes', {title: msg(req, 'btn.routes'), navigate: navigate, route: route, network: network});
    } catch (err) {
      res.render('routes', {title: msg(req, 'btn.routes'), navigate: navigate, error: msg(req, 'msg.routeAddFailed', { nwid: req.params.nwid, err })});
    }
  }

}

// route_delete GET
exports.route_delete = async function (req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  const route =
    {
      target: req.params.target_ip + '/' + req.params.target_prefix,
      via: null
    };


  try {
    const network = await zt.routes(req.params.nwid, route, 'delete');
    navigate.whence = '/controller/network/' + network.nwid;
    res.render('routes', {title: msg(req, 'btn.routes'), navigate: navigate, route: route, network: network});
  } catch (err) {
    res.render('routes', {title: msg(req, 'btn.routes'), navigate: navigate, error: msg(req, 'msg.routeDeleteFailed', { nwid: req.params.nwid, err })});
  }
}

// ipAssignmentPool_delete GET
exports.ipAssignmentPool_delete = async function (req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  const ipAssignmentPool =
    {
      ipRangeStart: req.params.ipRangeStart,
      ipRangeEnd: req.params.ipRangeEnd
    };


  try {
    const network = await zt.ipAssignmentPools(req.params.nwid, ipAssignmentPool, 'delete');
    navigate.whence = '/controller/network/' + network.nwid;
    res.render('ipAssignmentPools', {title: msg(req, 'btn.assignmentPools'), navigate: navigate, ipAssignmentPool: ipAssignmentPool, network: network});
  } catch (err) {
    res.render('ipAssignmentPools', {title: msg(req, 'btn.assignmentPools'), navigate: navigate, error: msg(req, 'msg.poolDeleteFailed', { nwid: req.params.nwid, err })});
  }
}

// private POST
exports.private = async function (req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  const private =
    {
      private: req.body.private === true || req.body.private === 'true' || req.body.private === 'on'
    };

  try {
    const network = await zt.network_object(req.params.nwid, private);
    navigate.whence = '/controller/network/' + network.nwid;
    res.render('private', {title: msg(req, 'private.title'), navigate: navigate, network: network});
  } catch (err) {
    res.render('private', {title: msg(req, 'private.title'), navigate: navigate, error: msg(req, 'msg.privateApplyFailed', { nwid: req.params.nwid, err })});
  }
}

// v4AssignMode POST
exports.v4AssignMode = async function (req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  const v4AssignMode =
    {
      v4AssignMode: { zt: req.body.zt === true || req.body.zt === 'true' || req.body.zt === 'on' }
    };

  try {
    const network = await zt.network_object(req.params.nwid, v4AssignMode);
    navigate.whence = '/controller/network/' + network.nwid;
    res.render('v4AssignMode', {title: msg(req, 'v4.title'), navigate: navigate, network: network});
  } catch (err) {
    res.render('v4AssignMode', {title: msg(req, 'v4.title'), navigate: navigate, error: msg(req, 'msg.v4ApplyFailed', { nwid: req.params.nwid, err })});
  }
}

// v6AssignMode POST
exports.v6AssignMode = async function (req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  const v6AssignMode =
    {
      v6AssignMode:
        {
          '6plane': req.body['6plane'] === true || req.body['6plane'] === 'true' || req.body['6plane'] === 'on',
          'rfc4193': req.body.rfc4193 === true || req.body.rfc4193 === 'true' || req.body.rfc4193 === 'on',
          'zt': req.body.zt === true || req.body.zt === 'true' || req.body.zt === 'on'
        }
    };

  try {
    const network = await zt.network_object(req.params.nwid, v6AssignMode);
    navigate.whence = '/controller/network/' + network.nwid;
    res.render('v6AssignMode', {title: msg(req, 'v6.title'), navigate: navigate, network: network});
  } catch (err) {
    res.render('v6AssignMode', {title: msg(req, 'v6.title'), navigate: navigate, error: msg(req, 'msg.v6ApplyFailed', { nwid: req.params.nwid, err })});
  }
}

// dns POST
exports.dns = async function (req, res) {
  const navigate = {
    active: 'networks',
    whence: ''
  };

  const dns = {
    dns: {
      domain: req.body.domain,
      servers: String(req.body.servers || '')
        .split('\n')
        .map(x => x.trim())
        .filter(ip => ip && isIP(ip))
    }
  };

  try {
    const network = await zt.network_object(req.params.nwid, dns);
    navigate.whence = '/controller/network/' + network.nwid;
    res.render('dns', {title: 'DNS', navigate: navigate, network: network});
  } catch (err) {
    res.render('dns', {title: 'DNS', navigate: navigate, error: msg(req, 'msg.dnsApplyFailed', { nwid: req.params.nwid, err })});
  }
}

// Display detail page for specific member
exports.member_detail = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  try {
    const {network, member} = await get_network_member(req.params.nwid, req.params.id);
    navigate.whence = '/controller/network/' + network.nwid + '#members';
    res.render('member_detail', {title: msg(req, 'page.memberDetail'), navigate: navigate, network: network, member: member});
  } catch (err) {
    console.error(err);
    res.render('error', {title: msg(req, 'page.memberError'), navigate: navigate, error: msg(req, 'msg.memberDetailFailed', { id: req.params.id, nwid: req.params.nwid, err })});
  }
};

// Member object GET
exports.member_object = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  if (!MEMBER_OBJECT_VIEWS.has(req.params.object)) {
    return res.status(404).render('error', { title: msg(req, 'page.notFound'), navigate, message: msg(req, 'msg.notFound'), error: {} });
  }

  try {
    const {network, member} = await get_network_member(req.params.nwid, req.params.id);
    navigate.whence = '/controller/network/' + network.nwid + '#members';
    res.render(req.params.object, {title: msg(req, 'page.ipAssignments'), navigate: navigate, network: network, member: member});
  } catch (err) {
    res.status(502).render('error', {title: msg(req, 'page.memberError'), navigate: navigate, message: msg(req, 'msg.memberResolveFailed', { id: req.params.id }), error: {}});
  }
}

// Easy network setup GET
exports.easy_get = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: '/controller/network/' + req.params.nwid
    }

  try {
    const network = await zt.network_detail(req.params.nwid);
    res.render('network_easy', {title: msg(req, 'page.easySetup'), navigate: navigate, network: network});
  } catch (err) {
    res.render('network_easy', {title: msg(req, 'page.easySetup'), navigate: navigate, error: msg(req, 'msg.easyResolveFailed', { nwid: req.params.nwid, err })});
  }
}

// Easy network setup POST
exports.easy_post = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: '/controller/networks'
    }

  req.checkBody('networkCIDR', msg(req, 'msg.cidrRequired')).notEmpty();
  req.sanitize('networkCIDR').trim();
  req.checkBody('networkCIDR', msg(req, 'msg.cidrInvalid'))
    .custom(value => isValidCidr(value, 32, 4));
  req.checkBody('poolStart', msg(req, 'msg.poolStartRequired'))
    .notEmpty();
  req.checkBody('poolStart', msg(req, 'msg.poolStartInvalid'))
    .isIP(4);
  req.sanitize('poolStart').trim();
  req.checkBody('poolEnd', msg(req, 'msg.poolEndRequired'))
    .notEmpty();
  req.checkBody('poolEnd', msg(req, 'msg.poolEndInvalid'))
    .isIP(4);
  req.sanitize('poolEnd').trim();

  const errors = req.validationErrors();

  const ipAssignmentPools =
    [{
      ipRangeStart: req.body.poolStart,
      ipRangeEnd: req.body.poolEnd
    }];

  const routes =
    [{
      target: req.body.networkCIDR,
      via: null
    }];

  const v4AssignMode =
    {
      zt: true
    };

  if (errors) {
    const network =
      {
        ipAssignmentPools: ipAssignmentPools,
        routes: routes,
        v4AssignMode: v4AssignMode
      };

    res.render('network_easy', {title: msg(req, 'page.easySetup'), navigate: navigate, network: network, errors: errors});
  } else {
    try {
      const network = await zt.network_easy_setup(req.params.nwid,
                                                  routes,
                                                  ipAssignmentPools,
                                                  v4AssignMode);
      res.render('network_easy', {title: msg(req, 'page.easySetup'), navigate: navigate, network: network, message: msg(req, 'msg.easySetupSucceeded')});
    } catch (err) {
      res.render('network_easy', {title: msg(req, 'page.easySetup'), navigate: navigate, error: msg(req, 'msg.easyResolveFailed', { nwid: req.params.nwid, err })});
    }
  }
}

// Easy members auth POST
exports.members = async function(req, res) {
  const redirect = '/controller/network/' + req.params.nwid + '#members';

  if (req.method !== 'POST') {
    return res.redirect(redirect);
  }

  const has = (name) => Object.prototype.hasOwnProperty.call(req.body, name);

  req.checkBody('id', msg(req, 'msg.memberIdRequired')).notEmpty();
  req.sanitize('id').trim();

  let errors = req.validationErrors();
  if (errors) {
    console.error('member update validation errors', errors);
    return res.redirect(redirect);
  }

  const id = req.body.id;

  try {
    if (has('auth')) {
      req.checkBody('auth', msg(req, 'msg.authBoolean')).isBoolean();
      req.sanitize('auth').trim();
      errors = req.validationErrors();
      if (!errors) {
        const authorized = req.body.auth === true || req.body.auth === 'true';
        await zt.member_object(req.params.nwid, id, { authorized });
      }
    } else if (has('activeBridge')) {
      req.checkBody('activeBridge', msg(req, 'msg.activeBridgeBoolean')).isBoolean();
      req.sanitize('activeBridge').trim();
      errors = req.validationErrors();
      if (!errors) {
        const activeBridge = req.body.activeBridge === true || req.body.activeBridge === 'true';
        await zt.member_object(req.params.nwid, id, { activeBridge });
      }
    } else if (has('name')) {
      req.sanitize('name').trim();
      const name = String(req.body.name || '').slice(0, 128);
      await storage.setItem(id, name);
    }
  } catch (err) {
    console.error('member update failed', err);
  }

  return res.redirect(redirect);
}

// Member delete GET or POST
exports.member_delete = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  try {
    const network = await zt.network_detail(req.params.nwid);
    let member = null;
    let name = null;
    if (req.method === 'POST') {
      member = await zt.member_delete(req.params.nwid, req.params.id);
      if (member.deleted) {
        name = await storage.removeItem(member.id);
      }
    } else {
      member = await zt.member_detail(req.params.nwid, req.params.id);
      name = await storage.getItem(member.id);
    }
    member.name = name || '';

    navigate.whence = '/controller/network/' + network.nwid;
    res.render('member_delete', {title: msg(req, 'page.deleteMemberNamed', { name: network.name }),
                                  navigate: navigate, network: network, member: member});
  } catch (err) {
    res.render('member_delete', {title: msg(req, 'page.deleteMember'), navigate: navigate,
                    error: msg(req, 'msg.memberDetailFailed', { id: req.params.id, nwid: req.params.nwid, err })});
  }
}

// ipAssignment delete GET
exports.delete_ip = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  try {
    const network = await zt.network_detail(req.params.nwid);
    let member = await zt.member_detail(req.params.nwid, req.params.id);
    navigate.whence = '/controller/network/' + network.nwid;
    member.name = (await storage.getItem(member.id)) || '';
    if (req.params.index) {
      member = await zt.ipAssignmentDelete(network.nwid, member.id,
                                                              req.params.index);
      res.redirect('/controller/network/' + network.nwid + '/member/' +
                                                  member.id + '/ipAssignments');
    }
    res.render('ipAssignments', {title: msg(req, 'page.ipAssignmentsNamed', { name: network.name }),
          navigate: navigate, index: req.params.index, network: network, member: member});
  } catch (err) {
    res.render('ipAssignments', {title: msg(req, 'page.ipAssignments'), navigate: navigate,
                    error: msg(req, 'msg.ipAssignmentResolveFailed', { id: req.params.id, nwid: req.params.nwid, err })});
  }
}

// ipAssignments POST
exports.assign_ip = async function(req, res) {
  const navigate =
    {
      active: 'networks',
      whence: ''
    }

  try {
    var network = await zt.network_detail(req.params.nwid);
  } catch (err) {
    throw err;
  }

  req.checkBody('ipAddress', msg(req, 'msg.ipRequired')).notEmpty();
  req.checkBody('ipAddress', msg(req, 'msg.ipInvalid')).isIP();
  req.checkBody('ipAddress', msg(req, 'msg.ipNotInRoute'))
    .custom(value => {
      if (!Array.isArray(network.routes)) return false;
      return network.routes.some(item => ipInCidr(value, item.target));
    });
  req.sanitize('ipAddress').trim();

  const errors = req.validationErrors();

  const ipAssignment = { ipAddress: req.body.ipAddress };

  try {
    let member = await zt.member_detail(req.params.nwid, req.params.id);
    navigate.whence = '/controller/network/' + network.nwid;

    if (!errors) {
      member = await zt.ipAssignmentAdd(network.nwid, member.id, ipAssignment);
    }

    member.name = (await storage.getItem(member.id)) || '';

    res.render('ipAssignments', {title: msg(req, 'page.ipAssignments'), navigate: navigate,
                  ipAssignment: ipAssignment, network: network, member: member,
                                                               errors: errors});
  } catch (err) {
    res.render('ipAssignments', {title: msg(req, 'page.ipAssignments'), navigate: navigate,
                    error: msg(req, 'msg.ipAssignmentResolveFailed', { id: req.params.id, nwid: req.params.nwid, err })});
  }
}
