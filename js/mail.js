/* ============================================================
   邮箱系统：挂机奖励 / 附件领取 / 批量删除
   ============================================================ */
function mailEnsure(p) {
  if (!Array.isArray(p.mails)) p.mails = [];
  if (typeof p.mailSeq !== 'number') p.mailSeq = 1;
}

/* 一次性福利邮件：每个存档只能领一次 */
function mailEnsureWelfare(p) {
  mailEnsure(p);
  if (p.welfareClaimed) return null;
  if (p.mails.some(m => m.welfare)) return null;
  const m = mailPush(p, {
    title: '新版本福利 · BOSS击杀凭证 ×1000',
    from: '运营团队',
    body: '感谢你的支持！这是本版本的一次性福利，每个存档只能领取一次。凭证可在「抽奖专员 · 李准」处抽奖。',
    items: [{ type:'mat', key:'bossToken', amount:1000 }]
  });
  m.welfare = true;
  m.read = false;
  return m;
}

/* 发一封邮件 */
function mailPush(p, opt) {
  mailEnsure(p);
  const m = {
    id: p.mailSeq++,
    title: opt.title || '系统邮件',
    from: opt.from || '系统',
    body: opt.body || '',
    items: opt.items || [],          // [{type:'gold'|'mat', key, amount}]
    at: Date.now(),
    read: false,
    claimed: false
  };
  p.mails.unshift(m);

  // 超过上限：从最旧的开始，未领取的直接领取并删除
  while (p.mails.length > DATA.MAIL.cap) {
    const old = p.mails[p.mails.length - 1];
    if (!old.claimed) mailClaimOne(p, old, true);
    p.mails.pop();
  }
  return m;
}

/* 领取一封邮件的附件（silent = 不弹提示） */
function mailClaimOne(p, m, silent) {
  if (!m || m.claimed) return 0;
  let n = 0;
  (m.items || []).forEach(it => {
    if (it.type === 'gold') { p.gold += it.amount; n++; }
    else if (it.type === 'mat') {
      p.materials[it.key] = (p.materials[it.key] || 0) + it.amount; n++;
    } else if (it.type === 'item' && it.item) {
      if (addToBag(p, it.item)) n++;
    }
  });
  if (m.welfare) p.welfareClaimed = true;
  m.claimed = true;
  m.read = true;
  if (!silent) { recalcStats(p); }
  return n;
}

/* 一键收取全部附件（并标记已读） */
function mailClaimAll(p) {
  mailEnsure(p);
  let cnt = 0, mailN = 0;
  p.mails.forEach(m => {
    if (!m.claimed && m.items && m.items.length) { cnt += mailClaimOne(p, m, true); mailN++; }
    m.read = true;
  });
  recalcStats(p);
  return { mails: mailN, items: cnt };
}

/* 删除某封邮件 */
function mailDelete(p, id) {
  mailEnsure(p);
  const i = p.mails.findIndex(m => m.id === id);
  if (i < 0) return false;
  p.mails.splice(i, 1);
  return true;
}

/* 一键删除已读邮件 */
function mailDeleteRead(p) {
  mailEnsure(p);
  const before = p.mails.length;
  p.mails = p.mails.filter(m => !m.read);
  return before - p.mails.length;
}

/* 未领取数量（用于红点） */
function mailUnreadCount(p) {
  mailEnsure(p);
  return p.mails.filter(m => !m.claimed && m.items && m.items.length).length;
}

/* ---------------- 挂机奖励：每 20 分钟一封 ---------------- */
function mailIdleTick(p, dt) {
  mailEnsure(p);
  if (typeof p.mailTimer !== 'number') p.mailTimer = 0;
  const need = DATA.MAIL.idleMinutes * 60;
  p.mailTimer += dt;
  if (p.mailTimer >= need) {
    p.mailTimer -= need;
    const R = DATA.MAIL.idleReward;
    const m = mailPush(p, {
      title: '挂机奖励',
      from: '运营团队',
      body: `你已在线挂机 ${DATA.MAIL.idleMinutes} 分钟，这是给你的补给。`,
      items: [
        { type:'gold', amount: R.gold },
        { type:'mat', key:'stone',   amount: R.stone },
        { type:'mat', key:'protect', amount: R.protect },
        { type:'mat', key:'skillT',  amount: R.skillT }
      ]
    });
    if (typeof toast === 'function') toast('📮 收到新邮件：挂机奖励');
    if (typeof logMsg === 'function') logMsg('📮 挂机奖励已发送到邮箱', 'loot');
    return m;
  }
  return null;
}
