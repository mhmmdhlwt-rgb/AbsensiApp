'use strict';
/* Phase 4: design-system alignment and cross-module record integrity. */
(function () {
  const App = window.App;
  const DB = window.DB;
  const M = window.PesantrenkuModules;
  if (!App || !DB || !M) return;

  const escText = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rupiah = value => 'Rp ' + Number(value || 0).toLocaleString('id-ID');

  async function deleteAcademicRecords(records) {
    for (const record of records) {
      await DB.d('catatanSantri', `akd_note_${record.id}`);
      await DB.d('academicRecords', record.id);
    }
  }

  M.deleteEvaluation = async function (evaluationId) {
    if (!_needAdmin()) return;
    const records = await DB.ga('academicRecords');
    await deleteAcademicRecords(records.filter(r => !r.deleted && r.evaluationId === evaluationId));
    await DB.d('academicEvaluations', evaluationId);
    CS(); T('Evaluasi dan catatan santrinya dihapus.'); S.akdEvalId = ''; await M.renderAkademik();
  };
  M.deleteProgramEvaluations = async function (programId) {
    if (!_needAdmin()) return;
    const [evaluations, records] = await Promise.all([DB.ga('academicEvaluations'), DB.ga('academicRecords')]);
    await deleteAcademicRecords(records.filter(r => !r.deleted && r.programId === programId));
    for (const evaluation of evaluations.filter(e => !e.deleted && e.programId === programId)) await DB.d('academicEvaluations', evaluation.id);
    CS(); T('Semua evaluasi dan catatan program dihapus.'); S.akdEvalId = ''; await M.renderAkademik();
  };
  M.deleteProgram = async function (programId) {
    if (!_needAdmin()) return;
    const [evaluations, records] = await Promise.all([DB.ga('academicEvaluations'), DB.ga('academicRecords')]);
    await deleteAcademicRecords(records.filter(r => !r.deleted && r.programId === programId));
    for (const evaluation of evaluations.filter(e => !e.deleted && e.programId === programId)) await DB.d('academicEvaluations', evaluation.id);
    await DB.d('academicPrograms', programId);
    CS(); T('Program, evaluasi, dan catatan santri dihapus.'); S.akdProgramId = ''; S.akdEvalId = ''; await M.renderAkademik();
  };

  const originalProfile = App.renderProfil.bind(App);
  App.renderProfil = async function (sntId) {
    await originalProfile(sntId);
    const target = document.getElementById('tab-catatan');
    if (!target || document.getElementById('phase4-finance-profile')) return;
    const [bills, payments] = await Promise.all([DB.ga('financeBills'), DB.ga('financePayments')]);
    const myBills = bills.filter(b => !b.deleted && b.sntId === sntId);
    const paidByBill = {};
    payments.filter(p => !p.deleted).forEach(p => { paidByBill[p.billId] = (paidByBill[p.billId] || 0) + Number(p.jumlah || 0); });
    const charged = myBills.reduce((sum, bill) => sum + Number(bill.jumlah || 0), 0);
    const paid = myBills.reduce((sum, bill) => sum + Number(paidByBill[bill.id] || 0), 0);
    const outstanding = Math.max(0, charged - paid);
    target.insertAdjacentHTML('beforeend', `<div id="phase4-finance-profile" class="phase4-profile-block"><div class="phase4-section-label">Keuangan</div><button class="phase4-finance-summary" onclick="PesantrenkuPhase4.showFinance('${sntId}')"><span><strong>${rupiah(outstanding)}</strong><small>Sisa tagihan</small></span><span><strong>${myBills.length}</strong><small>Tagihan</small></span><i>›</i></button></div>`);
  };

  window.PesantrenkuPhase4 = {
    async showFinance(sntId) {
      const [bills, payments, santri] = await Promise.all([DB.ga('financeBills'), DB.ga('financePayments'), DB.ga('santri')]);
      const sn = santri.find(s => s.id === sntId);
      const paidByBill = {};
      payments.filter(p => !p.deleted).forEach(p => { paidByBill[p.billId] = (paidByBill[p.billId] || 0) + Number(p.jumlah || 0); });
      const rows = bills.filter(b => !b.deleted && b.sntId === sntId).sort((a, b) => (b.periode || '').localeCompare(a.periode || '')).map(bill => {
        const paid = paidByBill[bill.id] || 0; const remaining = Math.max(0, Number(bill.jumlah || 0) - paid);
        return `<div class="phase4-ledger-row"><div><strong>${escText(bill.jenis || 'Tagihan')}</strong><small>${escText(bill.periode || '-')} · Jatuh tempo ${escText(bill.jatuhTempo || '-')}</small></div><div class="phase4-ledger-money"><strong>${rupiah(remaining)}</strong><small>${paid ? `Terbayar ${rupiah(paid)}` : 'Belum ada pembayaran'}</small></div></div>`;
      }).join('') || '<div class="phase4-empty">Belum ada tagihan keuangan.</div>';
      OS(`<div class="sh">Keuangan ${escText(sn?.nama || 'Santri')}</div><div class="sb phase4-sheet"><div class="phase4-context">Ringkasan tagihan dan pembayaran tercatat untuk santri ini.</div>${rows}</div>`);
    }
  };

  const originalRenderSet = App.renderSet.bind(App);
  App.renderSet = async function () {
    await originalRenderSet();
    const gender = (await DB.g('settings', 'jenis_kelamin').catch(() => null))?.value || 'perempuan';
    document.body.classList.toggle('phase4-putra', gender === 'laki');
    const setting = document.getElementById('phase3-structure-settings');
    if (setting) {
      const status = setting.querySelector('.sr2:last-child .sv');
      if (status) status.textContent = gender === 'laki' ? 'Tidak tersedia untuk asrama putra' : 'Aktif untuk asrama putri';
    }
  };

  const originalToggleJK = App._toggleJK?.bind(App);
  if (originalToggleJK) {
    App._toggleJK = async function (input) {
      await originalToggleJK(input);
      const gender = (await DB.g('settings', 'jenis_kelamin').catch(() => null))?.value || 'perempuan';
      document.body.classList.toggle('phase4-putra', gender === 'laki');
    };
  }
})();

(function () {
  const style = document.createElement('style');
  style.textContent = `
    /* Use the application palette, typography, elevation, and radii for every Phase 3/4 component. */
    .phase3-page{padding:0 15px 18px}.phase3-program-picker,.phase3-section{border-color:var(--sub);border-radius:var(--r4);box-shadow:var(--shadow-sm);backdrop-filter:blur(22px)}.phase3-program-picker summary,.phase3-section header strong,.phase3-program span,.phase3-evaluation strong{font-family:var(--fd);font-weight:800;letter-spacing:0;color:var(--t1)}.phase3-program{border-color:var(--sub);border-radius:var(--r3);background:var(--su);box-shadow:var(--shadow-sm);transition:transform .18s var(--ease),border-color .18s var(--ease),background .18s var(--ease)}.phase3-program:active,.phase3-evaluation:active,.phase4-finance-summary:active{transform:scale(.985)}.phase3-program.selected,.phase3-evaluation.selected{background:var(--gs);border-color:rgba(13,181,127,.3);box-shadow:inset 0 0 0 1px rgba(13,181,127,.12),var(--shadow-sm)}.phase3-program.selected span,.phase3-evaluation.selected strong{color:var(--a1)}.phase3-stats>div{background:var(--su);border-color:var(--sub);border-radius:var(--r3);box-shadow:var(--shadow-sm)}.phase3-stats strong{font-family:var(--fd);font-weight:900;color:var(--a1)}.phase3-icon-btn{border-radius:50%;background:var(--gl);border-color:var(--glb);color:var(--a1);box-shadow:var(--shadow-sm);font-family:var(--fd);font-weight:700}.phase3-icon-btn:active{transform:scale(.9)}.phase3-context,.phase3-readonly{background:var(--gs);border-color:rgba(13,181,127,.14);border-radius:var(--r3);color:var(--t2)}.phase3-check-list{background:var(--su);border-color:var(--sub);border-radius:var(--r3)}.phase3-check-row{border-color:var(--dv)}.phase3-check-row input{accent-color:var(--a1)}.phase3-upload{background:var(--gs);border-color:rgba(13,181,127,.28);border-radius:var(--r3);color:var(--a1)}.phase3-danger-btn{font-family:var(--fd);border-radius:var(--r3);background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.2);color:#ef4444}.phase3-note{background:var(--gs);border-left-color:var(--a1);border-radius:0 var(--r2) var(--r2) 0}.phase3-bulk{background:var(--gs);border-color:rgba(13,181,127,.18);border-radius:var(--r3);box-shadow:var(--shadow-sm)}.phase3-inactive-card{background:var(--su);border-color:var(--sub);border-radius:var(--r3);box-shadow:var(--shadow-sm)}.phase3-inactive-card strong{color:var(--t2)}.phase3-snt-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:-2px 0 10px}.phase3-snt-filters select{min-width:0;width:100%;padding:8px;background:var(--su);border:1px solid var(--dv);border-radius:var(--r2);color:var(--t2);font:600 10px var(--fb)}.phase4-profile-block{margin-top:13px}.phase4-section-label{font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px}.phase4-finance-summary{width:100%;display:grid;grid-template-columns:1fr 1fr 18px;gap:8px;align-items:center;text-align:left;padding:11px 12px;border:1px solid var(--sub);border-radius:var(--r3);background:var(--su);box-shadow:var(--shadow-sm);color:var(--t1)}.phase4-finance-summary strong,.phase4-finance-summary small{display:block}.phase4-finance-summary strong{font-family:var(--fd);font-size:13px;font-weight:800}.phase4-finance-summary small{font-size:10px;color:var(--t3);margin-top:2px}.phase4-finance-summary i{font-style:normal;font-size:20px;color:var(--t4);text-align:right}.phase4-sheet{padding-bottom:100px}.phase4-context{padding:10px 12px;margin-bottom:8px;background:var(--gs);border:1px solid rgba(13,181,127,.14);border-radius:var(--r3);font-size:11px;color:var(--t2);line-height:1.5}.phase4-ledger-row{display:flex;justify-content:space-between;gap:10px;padding:11px 2px;border-bottom:1px solid var(--dv)}.phase4-ledger-row strong,.phase4-ledger-row small{display:block}.phase4-ledger-row strong{font-size:12px;color:var(--t1)}.phase4-ledger-row small{font-size:10px;color:var(--t3);margin-top:2px}.phase4-ledger-money{text-align:right}.phase4-ledger-money strong{color:var(--a1)}.phase4-empty{padding:18px 0;text-align:center;font-size:12px;color:var(--t3)}.phase4-putra #set-body [onclick*="_popUzur"],.phase4-putra #set-body [onclick*="_addUzur"],.phase4-putra #set-body [onclick*="Uzur"]{display:none!important}
    @media(max-width:520px){.phase3-snt-filters{grid-template-columns:1fr}.phase3-snt-filters select{font-size:11px;padding:10px 11px}.phase4-finance-summary{padding:10px}.phase4-finance-summary strong{font-size:12px}.phase4-sheet{padding-bottom:150px}}
  `;
  document.head.appendChild(style);
})();
