/*
  ztncui - ZeroTier network controller UI
  Copyright (C) 2017-2021  Key Networks (https://key-networks.com)
  Licensed under GPLv3 - see LICENSE for details.

  Dependency-free message catalog and locale negotiation for the admin UI.
  The dictionaries are flat: every key is semantic ("nav.overview") and both
  locales must expose exactly the same key set (enforced by the test script
  tests/ztncui-i18n.test.js).
*/

const LOCALES = ['zh-CN', 'en'];

// Overridable so a deployment can default to English without patching code.
const DEFAULT_LOCALE = normalizeLocale(process.env.DEFAULT_LOCALE) || 'zh-CN';

const messages = {
  'zh-CN': {
    // Document chrome, shared by every layout.
    'app.titleSuffix': ' · ZeroTier 控制器',
    'a11y.skipToContent': '跳到主要内容',
    'a11y.toggleNav': '切换导航',
    'a11y.primaryNav': '主导航',
    'brand.planetController': 'Planet 控制器',
    'footer.tagline': '自托管 ZeroTier planet 与控制器',

    // Primary navigation, account links and the language switcher.
    'nav.overview': '概览',
    'nav.networks': '网络',
    'nav.newNetwork': '新建网络',
    'nav.users': '用户',
    'nav.inviteUser': '邀请用户',
    'nav.allUsers': '全部用户',
    'nav.signIn': '登录',
    'nav.signOut': '退出登录',
    'nav.back': '返回',
    'nav.language': '语言',
    'nav.langEn': 'EN',
    'nav.langZhCn': '中文',
    'nav.switchToEn': '切换到英文',
    'nav.switchToZhCn': '切换到简体中文',

    // Browser tab / page titles (also used as headings where noted).
    'page.login': '登录',
    'page.adminUsers': '管理员用户',
    'page.setPassword': '设置密码',
    'page.createAdmin': '新建管理员用户',
    'page.deleteUser': '删除用户',
    'page.deletedUser': '已删除用户',
    'page.networks': '此控制器上的网络',
    'page.network': '网络 {name}',
    'page.networkDetail': '网络详情',
    'page.createNetwork': '创建网络',
    'page.deleteNetwork': '删除网络',
    'page.notFound': '未找到',
    'page.networkError': '网络错误',
    'page.memberDetail': '网络成员详情',
    'page.memberError': '成员错误',
    'page.easySetup': '网络快速配置',
    'page.deleteMemberNamed': '从 {name} 删除成员',
    'page.deleteMember': '从网络删除成员',
    'page.ipAssignments': 'IP 分配',
    'page.ipAssignmentsNamed': 'IP 分配 — {name}',

    // Controller overview.
    'overview.eyebrow': '控制器',
    'overview.title': '概览',
    'overview.addressLabel': '控制器地址',
    'overview.versionLabel': 'ZeroTier 版本',
    'overview.networksKicker': '网络',
    'overview.networksTitle': '管理网络',
    'overview.accessKicker': '访问权限',
    'overview.accessTitle': '管理员用户',
    'overview.securityKicker': '安全',
    'overview.securityTitle': '修改密码',

    // Sign-in and the public landing page.
    'login.title': '登录',
    'login.backToPlanet': '返回 planet 概览',
    'frontDoor.title': 'ZeroTier Planet',
    'frontDoor.subtitle': '自托管根服务器与网络控制器，一个容器即可运行。',
    'frontDoor.getClient': '下载客户端',

    // Error pages.
    'error.eyebrow': '错误',
    'error.fallback': '出错了',
    'error.backToOverview': '返回概览',
    'err.badOrigin': '请求来源校验失败：请通过正确的域名或 IP 访问，或设置 ALLOWED_ORIGINS',

    // Buttons and links.
    'btn.newNetwork': '新建网络',
    'btn.createFirstNetwork': '创建第一个网络',
    'btn.details': '详情',
    'btn.easySetup': '快速配置',
    'btn.delete': '删除',
    'btn.save': '保存',
    'btn.cancel': '取消',
    'btn.signIn': '登录',
    'btn.createNetwork': '创建网络',
    'btn.generate': '生成',
    'btn.applySetup': '应用配置',
    'btn.refresh': '刷新',
    'btn.remove': '移除',
    'btn.assignIp': '分配 IP',
    'btn.assign': '分配',
    'btn.routes': '路由',
    'btn.assignmentPools': '分配池',
    'btn.ipv4Mode': 'IPv4 模式',
    'btn.ipv6Mode': 'IPv6 模式',
    'btn.allNetworks': '全部网络',
    'btn.backToNetworks': '返回网络列表',
    'btn.backToMembers': '返回成员列表',
    'btn.addRoute': '添加路由',
    'btn.addPool': '添加分配池',
    'btn.saveDns': '保存 DNS',
    'btn.setPassword': '设置密码',
    'btn.createAdmin': '创建管理员',
    'btn.removeMember': '移除成员',
    'btn.edit': '编辑',
    'btn.savePassword': '保存密码',

    // Field and table-column labels (also reused for mobile data-label).
    'field.network': '网络',
    'field.networkId': '网络 ID',
    'field.actions': '操作',
    'field.networkName': '网络名称',
    'field.member': '成员',
    'field.authorized': '已授权',
    'field.activeBridge': '活动网桥',
    'field.ipAssignments': 'IP 分配',
    'field.status': '状态',
    'field.target': '目标',
    'field.gateway': '网关',
    'field.rangeStart': '起始地址',
    'field.rangeEnd': '结束地址',
    'field.targetCidr': '目标（CIDR）',
    'field.gatewayOptional': '网关（可选）',
    'field.addIpAddress': '添加 IP 地址',
    'field.domain': '域名',
    'field.servers': 'DNS 服务器',
    'field.user': '用户',
    'field.password': '密码',
    'field.username': '用户名',
    'field.newPassword': '新密码',
    'field.confirmPassword': '确认密码',
    'field.networkCidr': '网络地址（CIDR）',
    'field.poolStart': '起始地址',
    'field.poolEnd': '结束地址',

    // Networks list and creation.
    'networks.emptyTitle': '还没有网络',
    'networks.emptyText': '创建网络以分配地址并授权成员。',
    'confirm.deleteNetwork': '确定要删除此网络及其所有成员吗？',
    'networkCreate.namePlaceholder': '例如：home-lab',
    'networkCreate.nameHint': '仅在控制器界面中显示，成员不可见。',

    // Easy setup.
    'easy.title': '快速配置',
    'easy.subtitle': '配置私有网段、分配池与托管路由（仅 IPv4）。',
    'easy.cidrHint': '点击“生成”时会随机选用一个 RFC1918 /24 网段。',

    // Access control page.
    'private.title': '访问控制',
    'private.subtitle': '只有被授权的成员才能通信。',
    'private.privateLabel': '私有网络',
    'private.publicLabel': '公开网络',
    'private.privateHint': '关闭后，所有成员无需授权即可互相通信。',
    'private.publicAlertTitle': '公开网络。',
    'private.publicAlertBody': '访问控制已关闭，成员授权不再限制流量。',

    // Network layout.
    'networkLayout.unavailable': '网络详情不可用。',

    // Member table and member state badges.
    'members.title': '成员',
    'members.countOne': '此网络上有 {count} 台设备',
    'members.countOther': '此网络上有 {count} 台设备',
    'members.emptyBefore': '还没有成员。邀请设备加入 ',
    'members.emptyAfter': '。',
    'member.authorized': '已授权',
    'member.notAuthorized': '未授权',
    'member.enabled': '启用',
    'member.disabled': '禁用',
    'status.controller': '控制器',
    'status.online': '在线',
    'status.relayOffline': '中继 / 离线',
    'status.offline': '离线',
    'confirm.removeMember': '确定要将此成员从网络中移除吗？',
    'networkDetail.properties': '网络属性',
    'networkDetail.propertiesHint': '点击属性即可编辑。',

    // Managed routes.
    'routes.empty': '还没有托管路由。',
    'routes.addTitle': '添加路由',
    'confirm.deleteRoute': '确定要删除此托管路由吗？',

    // IP assignment pools.
    'pools.empty': '尚未配置分配池。',
    'pools.addTitle': '添加分配池',
    'confirm.deletePool': '确定要删除此分配池吗？',

    // Static IP assignments.
    'ipAssignments.empty': '没有静态 IP 分配。',
    'ipAssignments.hint': '该地址必须位于此网络的某个托管路由范围内。',
    'ipAssignments.managedRoutes': '托管路由',
    'ipAssignments.noRoutes': '没有托管路由。',
    'confirm.removeIpAssignment': '确定要移除此 IP 分配吗？',

    // DNS.
    'dns.subtitle': '下发给已授权成员的分域 DNS。',
    'dns.empty': '此网络没有 DNS 配置。',
    'dns.serversPlaceholder': '每行一个 IP 地址',
    'dns.hint': '支持 IPv4 与 IPv6 地址；无效行会被忽略。',

    // Password page.
    'password.subtitle': '至少 10 个字符。',
    'password.requireChange': '下次登录时要求修改密码',
    'password.requireChangeHint': '为他人创建账号时很有用。',

    // Admin users list.
    'users.emptyTitle': '没有管理员用户',
    'users.emptyText': '创建管理员账号以访问控制器。',
    'users.passSet': '已设置',
    'users.changeRequired': '需要修改',
    'users.deleteConfirm': '确定要删除此管理员用户吗？',
    'users.description': '具有管理员权限的用户列表',
    'users.listFailed': '返回用户列表时出错',

    // User deletion.
    'userDelete.noSuchUser': '用户不存在。',
    'userDelete.selfDelete': '不能删除自己的账号。',
    'userDelete.deleted': '{name} 已被删除。',
    'userDelete.subtitle': '此操作无法撤销。最后一个管理员不能被删除。',
    'userDelete.confirmButton': '删除 {name}',

    // Member removal.
    'memberDelete.removed': '{name} 已从网络中移除。',
    'memberDelete.title': '移除成员',
    'memberDelete.willLoseAccess': '（{id}）将失去访问权限，直到重新加入。',
    'memberDelete.warning': '删除成员不会吊销其身份；重新加入后可能再次出现。',

    // IPv4 / IPv6 assignment modes.
    'v4.title': 'IPv4 分配',
    'v4.subtitle': '从分配池自动分配 IPv4 地址。',
    'v4.autoAssign': '从 IP 分配池自动分配',
    'v4.autoAssignHint': '由控制器管理；成员加入时会获得地址。',
    'v6.title': 'IPv6 分配',
    'v6.subtitle': '选择 IPv6 地址的分配方式。',
    'v6.sixPlane': 'ZT 6PLANE',
    'v6.sixPlaneHint': '为每台设备分配 /80 可路由前缀。',
    'v6.rfc4193': 'RFC 4193',
    'v6.rfc4193Hint': '为每台设备分配 /128 唯一本地地址。',
    'v6.fromPools': '来自分配池',
    'v6.fromPoolsHint': '使用已配置的 IPv6 分配池。',

    // Placeholder page for unimplemented settings.
    'notImplemented.title': '此界面不支持',
    'notImplemented.editingBefore': '正在编辑 ',
    'notImplemented.editingAfter': '，此功能在此界面中尚未实现。',
    'notImplemented.openMember': '打开成员详情',
    'notImplemented.settingsBefore': '大部分成员设置可在',
    'notImplemented.membersPage': '成员页面',
    'notImplemented.settingsAfter': '中找到。',

    // Flash and validation messages (server-rendered).
    'msg.tooManyAttempts': '登录失败次数过多，请稍后再试。',
    'msg.authFailed': '认证失败，请检查用户名和密码。',
    'msg.authenticatedAs': '已登录为 {name}',
    'msg.invalidUsername': '用户名无效',
    'msg.ownPasswordOnly': '只能修改自己的密码',
    'msg.passwordRequired': '密码不能为空',
    'msg.passwordMinLength': '密码长度至少为 {min} 个字符',
    'msg.passwordReenter': '请再次输入密码',
    'msg.passwordsDiffer': '两次输入的密码不一致',
    'msg.checkErrorsBelow': '请检查下方的错误',
    'msg.passwordSetFor': '已为 {name} 成功设置密码',
    'msg.usernameRule': '用户名必须为 1–64 个字符：字母、数字、点、下划线或连字符',
    'msg.userExists': '该用户名已存在',
    'msg.lastAdminCannotBeDeleted': '不能删除最后一个管理员用户',
    'msg.error': '错误',
    'msg.ztStatusFailed': '获取 ZeroTier 状态出错：{err}',
    'msg.networksListFailed': '获取此控制器的网络列表时出错：{err}',
    'msg.networkDetailFailed': '解析网络 {nwid} 的详情时出错：{err}',
    'msg.networkCreateFailed': '创建网络 {name} 时出错',
    'msg.networkResolveFailed': '解析网络 {nwid} 时出错：{err}',
    'msg.networkDeleteFailed': '删除网络 {nwid} 时出错：{err}',
    'msg.networkObjectResolveFailed': '解析网络 {nwid} 的详情时出错',
    'msg.notFound': '未找到',
    'msg.memberDetailFailed': '解析网络 {nwid} 的成员 {id} 的详情时出错：{err}',
    'msg.memberResolveFailed': '解析成员 {id} 的详情时出错',
    'msg.memberIdRequired': '成员 ID 不能为空',
    'msg.authBoolean': '授权状态必须为布尔值',
    'msg.activeBridgeBoolean': 'activeBridge 状态必须为布尔值',
    'msg.ipRangeStartRequired': 'IP 范围起始地址不能为空',
    'msg.ipRangeStartInvalid': 'IP 范围起始地址必须是有效的 IPv4 或 IPv6 地址',
    'msg.ipRangeEndRequired': 'IP 范围结束地址不能为空',
    'msg.ipRangeEndInvalid': 'IP 范围结束地址必须是有效的 IPv4 或 IPv6 地址',
    'msg.poolsResolveFailed': '解析网络 {nwid} 的详情时出错：{err}',
    'msg.poolsApplyFailed': '为网络 {nwid} 应用 IP 分配池时出错：{err}',
    'msg.poolDeleteFailed': '为网络 {nwid} 删除 IP 分配池时出错：{err}',
    'msg.targetRequired': '目标网络不能为空',
    'msg.targetInvalidCidr': '目标网络必须是有效的 CIDR 格式',
    'msg.gatewayInvalid': '网关必须是有效的 IPv4 或 IPv6 地址',
    'msg.routeResolveFailed': '解析网络详情时出错',
    'msg.routeAddFailed': '为网络 {nwid} 添加路由时出错：{err}',
    'msg.routeDeleteFailed': '为网络 {nwid} 删除路由时出错：{err}',
    'msg.privateApplyFailed': '为网络 {nwid} 应用访问控制设置时出错：{err}',
    'msg.v4ApplyFailed': '为网络 {nwid} 应用 IPv4 分配模式时出错：{err}',
    'msg.v6ApplyFailed': '为网络 {nwid} 应用 IPv6 分配模式时出错：{err}',
    'msg.dnsApplyFailed': '为网络 {nwid} 更新 DNS 时出错：{err}',
    'msg.easyResolveFailed': '解析网络 {nwid} 的详情时出错：{err}',
    'msg.easySetupSucceeded': '网络配置成功',
    'msg.networkNameRequired': '网络名称不能为空',
    'msg.cidrRequired': '网络地址不能为空',
    'msg.cidrInvalid': '网络地址必须使用 CIDR 表示法',
    'msg.poolStartRequired': 'IP 分配池的起始地址不能为空',
    'msg.poolStartInvalid': 'IP 分配池的起始地址必须是有效的 IPv4 地址',
    'msg.poolEndRequired': 'IP 分配池的结束地址不能为空',
    'msg.poolEndInvalid': 'IP 分配池的结束地址必须是有效的 IPv4 地址',
    'msg.ipRequired': 'IP 地址不能为空',
    'msg.ipInvalid': 'IP 地址必须是有效的 IPv4 或 IPv6 地址',
    'msg.ipNotInRoute': 'IP 地址必须位于某个托管路由范围内',
    'msg.ipAssignmentResolveFailed': '解析网络 {nwid} 的成员 {id} 的详情时出错：{err}'
  },

  en: {
    // Document chrome, shared by every layout.
    'app.titleSuffix': ' · ZeroTier controller',
    'a11y.skipToContent': 'Skip to content',
    'a11y.toggleNav': 'Toggle navigation',
    'a11y.primaryNav': 'Primary',
    'brand.planetController': 'Planet controller',
    'footer.tagline': 'Self-hosted ZeroTier planet & controller',

    // Primary navigation, account links and the language switcher.
    'nav.overview': 'Overview',
    'nav.networks': 'Networks',
    'nav.newNetwork': 'New network',
    'nav.users': 'Users',
    'nav.inviteUser': 'Invite user',
    'nav.allUsers': 'All users',
    'nav.signIn': 'Sign in',
    'nav.signOut': 'Sign out',
    'nav.back': 'Back',
    'nav.language': 'Language',
    'nav.langEn': 'EN',
    'nav.langZhCn': '中文',
    'nav.switchToEn': 'Switch to English',
    'nav.switchToZhCn': 'Switch to Simplified Chinese',

    // Browser tab / page titles (also used as headings where noted).
    'page.login': 'Login',
    'page.adminUsers': 'Admin users',
    'page.setPassword': 'Set password',
    'page.createAdmin': 'Create new admin user',
    'page.deleteUser': 'Delete user',
    'page.deletedUser': 'Deleted user',
    'page.networks': 'Networks on this controller',
    'page.network': 'Network {name}',
    'page.networkDetail': 'Detail for network',
    'page.createNetwork': 'Create network',
    'page.deleteNetwork': 'Delete network',
    'page.notFound': 'Not found',
    'page.networkError': 'Network error',
    'page.memberDetail': 'Network member detail',
    'page.memberError': 'Member error',
    'page.easySetup': 'Easy setup of network',
    'page.deleteMemberNamed': 'Delete member from {name}',
    'page.deleteMember': 'Delete member from network',
    'page.ipAssignments': 'IP assignments',
    'page.ipAssignmentsNamed': 'IP assignments — {name}',

    // Controller overview.
    'overview.eyebrow': 'Controller',
    'overview.title': 'Overview',
    'overview.addressLabel': 'Controller address',
    'overview.versionLabel': 'ZeroTier version',
    'overview.networksKicker': 'Networks',
    'overview.networksTitle': 'Manage networks',
    'overview.accessKicker': 'Access',
    'overview.accessTitle': 'Admin users',
    'overview.securityKicker': 'Security',
    'overview.securityTitle': 'Change your password',

    // Sign-in and the public landing page.
    'login.title': 'Sign in',
    'login.backToPlanet': 'Back to the planet overview',
    'frontDoor.title': 'ZeroTier Planet',
    'frontDoor.subtitle': 'Self-hosted root server and network controller in one container.',
    'frontDoor.getClient': 'Get a client',

    // Error pages.
    'error.eyebrow': 'Error',
    'error.fallback': 'Something went wrong',
    'error.backToOverview': 'Back to overview',
    'err.badOrigin': 'Request origin rejected: use the configured hostname, or set ALLOWED_ORIGINS',

    // Buttons and links.
    'btn.newNetwork': 'New network',
    'btn.createFirstNetwork': 'Create the first network',
    'btn.details': 'Details',
    'btn.easySetup': 'Easy setup',
    'btn.delete': 'Delete',
    'btn.save': 'Save',
    'btn.cancel': 'Cancel',
    'btn.signIn': 'Sign in',
    'btn.createNetwork': 'Create network',
    'btn.generate': 'Generate',
    'btn.applySetup': 'Apply setup',
    'btn.refresh': 'Refresh',
    'btn.remove': 'Remove',
    'btn.assignIp': 'Assign IP',
    'btn.assign': 'Assign',
    'btn.routes': 'Routes',
    'btn.assignmentPools': 'Assignment pools',
    'btn.ipv4Mode': 'IPv4 mode',
    'btn.ipv6Mode': 'IPv6 mode',
    'btn.allNetworks': 'All networks',
    'btn.backToNetworks': 'Back to networks',
    'btn.backToMembers': 'Back to members',
    'btn.addRoute': 'Add route',
    'btn.addPool': 'Add pool',
    'btn.saveDns': 'Save DNS',
    'btn.setPassword': 'Set password',
    'btn.createAdmin': 'Create admin',
    'btn.removeMember': 'Remove member',
    'btn.edit': 'Edit',
    'btn.savePassword': 'Save password',

    // Field and table-column labels (also reused for mobile data-label).
    'field.network': 'Network',
    'field.networkId': 'Network ID',
    'field.actions': 'Actions',
    'field.networkName': 'Network name',
    'field.member': 'Member',
    'field.authorized': 'Authorized',
    'field.activeBridge': 'Active bridge',
    'field.ipAssignments': 'IP assignments',
    'field.status': 'Status',
    'field.target': 'Target',
    'field.gateway': 'Gateway',
    'field.rangeStart': 'Range start',
    'field.rangeEnd': 'Range end',
    'field.targetCidr': 'Target (CIDR)',
    'field.gatewayOptional': 'Gateway (optional)',
    'field.addIpAddress': 'Add IP address',
    'field.domain': 'Domain',
    'field.servers': 'DNS servers',
    'field.user': 'User',
    'field.password': 'Password',
    'field.username': 'Username',
    'field.newPassword': 'New password',
    'field.confirmPassword': 'Confirm password',
    'field.networkCidr': 'Network address (CIDR)',
    'field.poolStart': 'Pool start',
    'field.poolEnd': 'Pool end',

    // Networks list and creation.
    'networks.emptyTitle': 'No networks yet',
    'networks.emptyText': 'Create a network to issue addresses and authorise members.',
    'confirm.deleteNetwork': 'Delete this network and all of its members?',
    'networkCreate.namePlaceholder': 'e.g. home-lab',
    'networkCreate.nameHint': 'Shown in the controller UI. Members never see it.',

    // Easy setup.
    'easy.title': 'Easy setup',
    'easy.subtitle': 'Set the private range, pool and managed route (IPv4 only).',
    'easy.cidrHint': 'A random RFC1918 /24 is used when you press Generate.',

    // Access control page.
    'private.title': 'Access control',
    'private.subtitle': 'Only authorised members can communicate.',
    'private.privateLabel': 'Private network',
    'private.publicLabel': 'Public network',
    'private.privateHint': 'Disabling this lets every member talk to every other member without authorisation.',
    'private.publicAlertTitle': 'Public network.',
    'private.publicAlertBody': ' Access control is off; member authorisation no longer restricts traffic.',

    // Network layout.
    'networkLayout.unavailable': 'Network details are unavailable.',

    // Member table and member state badges.
    'members.title': 'Members',
    'members.countOne': '{count} device on this network',
    'members.countOther': '{count} devices on this network',
    'members.emptyBefore': 'No members yet. Invite a device to join ',
    'members.emptyAfter': '.',
    'member.authorized': 'Authorized',
    'member.notAuthorized': 'Not authorized',
    'member.enabled': 'Enabled',
    'member.disabled': 'Disabled',
    'status.controller': 'Controller',
    'status.online': 'Online',
    'status.relayOffline': 'Relay / offline',
    'status.offline': 'Offline',
    'confirm.removeMember': 'Remove this member from the network?',
    'networkDetail.properties': 'Network properties',
    'networkDetail.propertiesHint': 'Click a property to edit it.',

    // Managed routes.
    'routes.empty': 'No managed routes yet.',
    'routes.addTitle': 'Add route',
    'confirm.deleteRoute': 'Delete this managed route?',

    // IP assignment pools.
    'pools.empty': 'No assignment pools configured.',
    'pools.addTitle': 'Add assignment pool',
    'confirm.deletePool': 'Delete this assignment pool?',

    // Static IP assignments.
    'ipAssignments.empty': 'No static IP assignments.',
    'ipAssignments.hint': 'The address must fall inside a managed route of this network.',
    'ipAssignments.managedRoutes': 'Managed routes',
    'ipAssignments.noRoutes': 'No managed routes.',
    'confirm.removeIpAssignment': 'Remove this IP assignment?',

    // DNS.
    'dns.subtitle': 'Split DNS pushed to authorised members.',
    'dns.empty': 'No DNS configuration on this network.',
    'dns.serversPlaceholder': 'One IP address per line',
    'dns.hint': 'IPv4 and IPv6 addresses are accepted; invalid lines are ignored.',

    // Password page.
    'password.subtitle': 'At least 10 characters.',
    'password.requireChange': 'Require password change on next login',
    'password.requireChangeHint': 'Useful when creating an account for someone else.',

    // Admin users list.
    'users.emptyTitle': 'No admin users',
    'users.emptyText': 'Create an administrator to access the controller.',
    'users.passSet': 'Set',
    'users.changeRequired': 'Change required',
    'users.deleteConfirm': 'Delete this admin user?',
    'users.description': 'List of users with admin privileges',
    'users.listFailed': 'Error returning list of users',

    // User deletion.
    'userDelete.noSuchUser': 'No such user.',
    'userDelete.selfDelete': 'You may not delete your own account.',
    'userDelete.deleted': '{name} was deleted.',
    'userDelete.subtitle': 'This cannot be undone. The last admin cannot be deleted.',
    'userDelete.confirmButton': 'Delete {name}',

    // Member removal.
    'memberDelete.removed': '{name} was removed from the network.',
    'memberDelete.title': 'Remove member',
    'memberDelete.willLoseAccess': ' ({id}) will lose access until it joins again.',
    'memberDelete.warning': 'Deleting a member does not revoke its identity; re-joining may recreate it.',

    // IPv4 / IPv6 assignment modes.
    'v4.title': 'IPv4 assignment',
    'v4.subtitle': 'Assign IPv4 addresses from the pools.',
    'v4.autoAssign': 'Auto-assign from IP assignment pools',
    'v4.autoAssignHint': 'Managed by the controller; members receive an address on join.',
    'v6.title': 'IPv6 assignment',
    'v6.subtitle': 'Choose how IPv6 addresses are assigned.',
    'v6.sixPlane': 'ZT 6PLANE',
    'v6.sixPlaneHint': '/80 routable prefix for each device.',
    'v6.rfc4193': 'RFC 4193',
    'v6.rfc4193Hint': '/128 unique local address for each device.',
    'v6.fromPools': 'From assignment pools',
    'v6.fromPoolsHint': 'Use the configured IPv6 assignment pools.',

    // Placeholder page for unimplemented settings.
    'notImplemented.title': 'Not available in this UI',
    'notImplemented.editingBefore': 'Editing ',
    'notImplemented.editingAfter': ' is not implemented here.',
    'notImplemented.openMember': 'Open member details',
    'notImplemented.settingsBefore': 'Most member settings are available on the ',
    'notImplemented.membersPage': 'members page',
    'notImplemented.settingsAfter': '.',

    // Flash and validation messages (server-rendered).
    'msg.tooManyAttempts': 'Too many failed login attempts. Please try again later.',
    'msg.authFailed': 'Authentication failed, please check your username and password.',
    'msg.authenticatedAs': 'Authenticated as {name}',
    'msg.invalidUsername': 'Invalid username',
    'msg.ownPasswordOnly': 'You may only change your own password',
    'msg.passwordRequired': 'Password required',
    'msg.passwordMinLength': 'Minimum password length is {min} characters',
    'msg.passwordReenter': 'Please re-enter password',
    'msg.passwordsDiffer': 'Passwords are not the same',
    'msg.checkErrorsBelow': 'Please check errors below',
    'msg.passwordSetFor': 'Successfully set password for {name}',
    'msg.usernameRule': 'Username must be 1-64 characters: letters, digits, dot, underscore or dash',
    'msg.userExists': 'A user with that name already exists',
    'msg.lastAdminCannotBeDeleted': 'The last admin user cannot be deleted',
    'msg.error': 'Error',
    'msg.ztStatusFailed': 'ERROR getting ZT status: {err}',
    'msg.networksListFailed': 'Error retrieving list of networks on this controller: {err}',
    'msg.networkDetailFailed': 'Error resolving detail for network {nwid}: {err}',
    'msg.networkCreateFailed': 'Error creating network {name}',
    'msg.networkResolveFailed': 'Error resolving network {nwid}: {err}',
    'msg.networkDeleteFailed': 'Error deleting network {nwid}: {err}',
    'msg.networkObjectResolveFailed': 'Error resolving detail for network {nwid}',
    'msg.notFound': 'Not found',
    'msg.memberDetailFailed': 'Error resolving detail for member {id} of network {nwid}: {err}',
    'msg.memberResolveFailed': 'Error resolving detail for member {id}',
    'msg.memberIdRequired': 'Member ID is required',
    'msg.authBoolean': 'Authorization state must be boolean',
    'msg.activeBridgeBoolean': 'activeBridge state must be boolean',
    'msg.ipRangeStartRequired': 'IP range start required',
    'msg.ipRangeStartInvalid': 'IP range start needs a valid IPv4 or IPv6 address',
    'msg.ipRangeEndRequired': 'IP range end required',
    'msg.ipRangeEndInvalid': 'IP range end needs a valid IPv4 or IPv6 address',
    'msg.poolsResolveFailed': 'Error resolving network detail for network {nwid}: {err}',
    'msg.poolsApplyFailed': 'Error applying IP Assignment Pools for network {nwid}: {err}',
    'msg.poolDeleteFailed': 'Error deleting IP Assignment Pool for network {nwid}: {err}',
    'msg.targetRequired': 'Target network is required',
    'msg.targetInvalidCidr': 'Target network must be valid CIDR format',
    'msg.gatewayInvalid': 'Gateway must be a valid IPv4 or IPv6 address',
    'msg.routeResolveFailed': 'Error resolving network detail',
    'msg.routeAddFailed': 'Error adding route for network {nwid}: {err}',
    'msg.routeDeleteFailed': 'Error deleting route for network {nwid}: {err}',
    'msg.privateApplyFailed': 'Error applying private for network {nwid}: {err}',
    'msg.v4ApplyFailed': 'Error applying v4AssignMode for network {nwid}: {err}',
    'msg.v6ApplyFailed': 'Error applying v6AssignMode for network {nwid}: {err}',
    'msg.dnsApplyFailed': 'Error updating dns for network {nwid}: {err}',
    'msg.easyResolveFailed': 'Error resolving detail for network {nwid}: {err}',
    'msg.easySetupSucceeded': 'Network setup succeeded',
    'msg.networkNameRequired': 'Network name required',
    'msg.cidrRequired': 'Network address is required',
    'msg.cidrInvalid': 'Network address must be in CIDR notation',
    'msg.poolStartRequired': 'Start of IP assignment pool is required',
    'msg.poolStartInvalid': 'Start of IP assignment pool must be valid IPv4 address',
    'msg.poolEndRequired': 'End of IP assignment pool is required',
    'msg.poolEndInvalid': 'End of IP assignment pool must be valid IPv4 address',
    'msg.ipRequired': 'IP address required',
    'msg.ipInvalid': 'IP address must be a valid IPv4 or IPv6 address',
    'msg.ipNotInRoute': 'IP address must fall within a managed route',
    'msg.ipAssignmentResolveFailed': 'Error resolving detail for member {id} of network {nwid}: {err}'
  }
};

/**
 * Map an arbitrary language tag to one of LOCALES.
 * "zh", "zh-cn", "zh-Hans", "zh_TW" -> "zh-CN"; "en", "en-US" -> "en".
 * Anything else (including non-strings) yields null.
 */
function normalizeLocale(value) {
  if (typeof value !== 'string') return null;
  const tag = value.trim();
  if (!tag) return null;
  const base = tag.split(/[-_]/)[0].toLowerCase();
  if (base === 'zh') return 'zh-CN';
  if (base === 'en') return 'en';
  return null;
}

/** Read one cookie without depending on cookie-parser being installed. */
function readCookie(req, name) {
  const jar = req && req.cookies;
  if (jar) {
    const value = jar[name];
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  }

  const header = req && req.headers ? req.headers.cookie : undefined;
  if (typeof header !== 'string' || header.length === 0) return undefined;

  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    let value = part.slice(eq + 1).trim();
    if (value.length > 1 && value[0] === '"' && value[value.length - 1] === '"') {
      value = value.slice(1, -1);
    }
    return value;
  }
  return undefined;
}

function decodeCookieValue(value) {
  try {
    return decodeURIComponent(value);
  } catch (err) {
    return value;
  }
}

/** Parse Accept-Language into tags ordered by q-value, then by position. */
function parseAcceptLanguage(header) {
  if (typeof header !== 'string' || header.length === 0) return [];

  const entries = [];
  const parts = header.split(',');
  for (let i = 0; i < parts.length; i++) {
    const pieces = parts[i].split(';');
    const tag = pieces[0].trim();
    if (!tag || tag === '*') continue;

    let quality = 1;
    for (let j = 1; j < pieces.length; j++) {
      const match = /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(pieces[j]);
      if (!match) continue;
      const parsed = Number.parseFloat(match[1]);
      if (Number.isFinite(parsed)) quality = parsed;
    }
    entries.push({ tag, quality, index: i });
  }

  entries.sort((a, b) => (b.quality - a.quality) || (a.index - b.index));
  return entries;
}

/**
 * Pick a locale for a request: explicit `lang` cookie first, then the first
 * acceptable zh/en tag from Accept-Language, then DEFAULT_LOCALE.
 */
function negotiate(req) {
  const cookie = readCookie(req, 'lang');
  if (typeof cookie === 'string' && cookie.trim()) {
    const fromCookie = normalizeLocale(decodeCookieValue(cookie));
    if (fromCookie) return fromCookie;
  }

  const header = req && req.headers ? req.headers['accept-language'] : undefined;
  for (const entry of parseAcceptLanguage(header)) {
    if (entry.quality <= 0) continue;
    const fromHeader = normalizeLocale(entry.tag);
    if (fromHeader) return fromHeader;
  }

  return DEFAULT_LOCALE;
}

function interpolate(template, vars) {
  if (!vars || typeof vars !== 'object' || typeof template !== 'string') return template;
  return template.replace(/\{([A-Za-z0-9_.]+)\}/g, (placeholder, name) => {
    if (!Object.prototype.hasOwnProperty.call(vars, name)) return placeholder;
    const value = vars[name];
    if (value === undefined || value === null) return placeholder;
    return String(value);
  });
}

/**
 * Look a key up for `locale`, falling back to English and then to the key
 * itself. `{placeholder}` tokens in the message are replaced from `vars`.
 */
function translate(locale, key, vars) {
  if (typeof key !== 'string' || key.length === 0) return '';

  const normalized = normalizeLocale(locale) || locale;
  const tables = [];
  if (typeof locale === 'string' && messages[locale]) tables.push(messages[locale]);
  if (typeof normalized === 'string' && messages[normalized] && normalized !== locale) {
    tables.push(messages[normalized]);
  }
  tables.push(messages.en);

  for (const table of tables) {
    if (Object.prototype.hasOwnProperty.call(table, key)) {
      return interpolate(String(table[key]), vars);
    }
  }

  return key;
}

module.exports = { LOCALES, DEFAULT_LOCALE, normalizeLocale, negotiate, translate };
