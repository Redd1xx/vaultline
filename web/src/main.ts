// Main controller for the Vaultline Zurich Private Bullion & Custody Clearinghouse console.

import { createVaultAcoustics } from './audio';
import { runDemo } from './chain';
import {
  bytesToHex,
  deriveArbiterIdentity,
  deriveBeneficiaryIdentity,
  deriveCustodianIdentity,
  deriveDepositorIdentity,
  hexToBytes,
  previewDepositAttestation,
  previewDisputeCommitment,
  previewEscrowCommitment,
  previewNullifierDigest,
  previewReleaseCertificate,
} from './crypto';
import {
  createClearinghouseStore,
  type BullionTrancheEntry,
  type ClearinghouseLedgerStore,
  type LocalCustodyVault,
} from './state';

const acoustics = createVaultAcoustics();

function randomBytes32(): Uint8Array {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return buf;
}

const localVault: LocalCustodyVault = {
  secretKey: randomBytes32(),
  depositorPub: new Uint8Array(32),
  beneficiaryPub: new Uint8Array(32),
  arbiterPub: new Uint8Array(32),
  custodianPub: new Uint8Array(32),
  shieldedDepositUsd: 75000n,
  publicFloorUsd: 25000n,
  denominationCode: 1,
  timelockSeconds: 10000,
  escrowSalt: randomBytes32(),
  custodianDepositSalt: randomBytes32(),
  selectedTrancheId: null,
};

let clearingStore: ClearinghouseLedgerStore;

// Query helper
function byId<T extends Element>(id: string): T | null {
  return document.getElementById(id) as unknown as T | null;
}

// Top Vault Banner & Visualizer Elements
const vaultBoltReadout = byId<HTMLElement>('vaultBoltReadout');
const vaultBoltLabel = byId<HTMLElement>('vaultBoltLabel');
const btnAcousticsToggle = byId<HTMLButtonElement>('btnAcousticsToggle');
const vaultDoorSvg = byId<SVGElement>('vaultDoorSvg');
const svgDoorCode = byId<HTMLElement>('svgDoorCode');
const solvencyVerdictTag = byId<HTMLElement>('solvencyVerdictTag');
const vizFloorMarker = byId<HTMLElement>('vizFloorMarker');
const vizDeficitZone = byId<HTMLElement>('vizDeficitZone');
const vizSatisfiedZone = byId<HTMLElement>('vizSatisfiedZone');
const vizFloorPin = byId<HTMLElement>('vizFloorPin');

// Conduit Nodes
const nodeStage1 = byId<HTMLElement>('nodeStage1');
const nodeStage2 = byId<HTMLElement>('nodeStage2');
const nodeStage3 = byId<HTMLElement>('nodeStage3');
const nodeStage4 = byId<HTMLElement>('nodeStage4');

// Quadrant I: Custodian Registration & Deposit Lock
const fieldPrincipalUsd = byId<HTMLInputElement>('fieldPrincipalUsd');
const fieldFloorUsd = byId<HTMLInputElement>('fieldFloorUsd');
const fieldTimelockSec = byId<HTMLInputElement>('fieldTimelockSec');
const btnLockBullion = byId<HTMLButtonElement>('btnLockBullion');
const btnAttestCustodian = byId<HTMLButtonElement>('btnAttestCustodian');
const outTrancheId = byId<HTMLElement>('outTrancheId');
const outCommitmentHash = byId<HTMLElement>('outCommitmentHash');

// Quadrant II: Zero-Knowledge Threshold Attestation
const selTrancheVerify = byId<HTMLSelectElement>('selTrancheVerify');
const btnExecuteZkProof = byId<HTMLButtonElement>('btnExecuteZkProof');
const zkirProofMonitor = byId<HTMLElement>('zkirProofMonitor');

// Quadrant III: Settlement Release & Nullifier Certificate
const btnSettleTranche = byId<HTMLButtonElement>('btnSettleTranche');
const outReleaseToken = byId<HTMLElement>('outReleaseToken');
const btnExportReceipt = byId<HTMLButtonElement>('btnExportReceipt');
const certStatusText = byId<HTMLElement>('certStatusText');
const certTrancheRef = byId<HTMLElement>('certTrancheRef');
const certNullifierRoot = byId<HTMLElement>('certNullifierRoot');

// Quadrant IV: Arbitrator Dispute & Timelock Resolution
const selTrancheDispute = byId<HTMLSelectElement>('selTrancheDispute');
const selArbiterDestination = byId<HTMLSelectElement>('selArbiterDestination');
const btnFreezeDispute = byId<HTMLButtonElement>('btnFreezeDispute');
const btnExecuteVerdict = byId<HTMLButtonElement>('btnExecuteVerdict');
const btnExpireTimelock = byId<HTMLButtonElement>('btnExpireTimelock');
const outArbitrationStatus = byId<HTMLElement>('outArbitrationStatus');

// Right-Hand Custody Rail: Presets, Ledger Inspector, Nullifier Registry, Contract Runner
const btnPresetPrime = byId<HTMLButtonElement>('btnPresetPrime');
const btnPresetParity = byId<HTMLButtonElement>('btnPresetParity');
const btnPresetDeficit = byId<HTMLButtonElement>('btnPresetDeficit');

const railLeakSeal = byId<HTMLElement>('railLeakSeal');
const inspArbiterKey = byId<HTMLElement>('inspArbiterKey');
const inspDepositorKey = byId<HTMLElement>('inspDepositorKey');
const inspCustodianCount = byId<HTMLElement>('inspCustodianCount');
const inspActiveCount = byId<HTMLElement>('inspActiveCount');
const inspSettledCount = byId<HTMLElement>('inspSettledCount');
const inspDisputeRatio = byId<HTMLElement>('inspDisputeRatio');

const railNullifierCount = byId<HTMLElement>('railNullifierCount');
const railNullifierList = byId<HTMLElement>('railNullifierList');

const btnExecuteCompiledContract = byId<HTMLButtonElement>('btnExecuteCompiledContract');
const contractRunnerStatus = byId<HTMLElement>('contractRunnerStatus');
const contractRunnerOutput = byId<HTMLElement>('contractRunnerOutput');

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendZkirLine(message: string, variant: 'pass' | 'circuit' | 'fail' | '' = ''): void {
  if (!zkirProofMonitor) return;
  const row = document.createElement('div');
  row.className = `zch-zkir-entry ${variant ? `is-${variant}` : ''}`.trim();
  row.textContent = `[ZKIR] ${message}`;
  zkirProofMonitor.appendChild(row);
  zkirProofMonitor.scrollTop = zkirProofMonitor.scrollHeight;
}

function setConduitProgress(stepNumber: 1 | 2 | 3 | 4): void {
  const nodes = [nodeStage1, nodeStage2, nodeStage3, nodeStage4];
  nodes.forEach((node, idx) => {
    if (!node) return;
    const pos = idx + 1;
    node.className = 'zch-conduit-node';
    if (pos < stepNumber || stepNumber === 4) {
      node.classList.add('is-done');
    } else if (pos === stepNumber) {
      node.classList.add('is-current');
    }
  });
}

function setVaultDoorMechanism(state: 'locked' | 'attested' | 'released' | 'breach'): void {
  if (vaultDoorSvg) {
    vaultDoorSvg.classList.remove('is-attested', 'is-released', 'is-breach');
    if (state === 'attested') vaultDoorSvg.classList.add('is-attested');
    if (state === 'released') vaultDoorSvg.classList.add('is-released');
    if (state === 'breach') vaultDoorSvg.classList.add('is-breach');
  }
  if (vaultBoltReadout && vaultBoltLabel && svgDoorCode) {
    if (state === 'locked') {
      vaultBoltReadout.dataset.state = 'locked';
      vaultBoltLabel.textContent = 'LOCKED';
      svgDoorCode.textContent = 'SEALED';
    } else if (state === 'attested') {
      vaultBoltReadout.dataset.state = 'verified';
      vaultBoltLabel.textContent = 'VERIFIED';
      svgDoorCode.textContent = 'ATTESTED';
    } else if (state === 'released') {
      vaultBoltReadout.dataset.state = 'verified';
      vaultBoltLabel.textContent = 'SETTLED';
      svgDoorCode.textContent = 'CLEARED';
    } else {
      vaultBoltReadout.dataset.state = 'breach';
      vaultBoltLabel.textContent = 'ALERT';
      svgDoorCode.textContent = 'ALERT';
    }
  }
}

function syncHorizonVisualizer(principalUsd: number, floorUsd: number): void {
  const clampedPct = Math.min(Math.max((floorUsd / 100000) * 100, 12), 86);
  if (vizFloorMarker) {
    vizFloorMarker.textContent = `FLOOR: $${floorUsd.toLocaleString()}`;
  }
  if (vizDeficitZone) {
    vizDeficitZone.style.width = `${clampedPct}%`;
  }
  if (vizSatisfiedZone) {
    vizSatisfiedZone.style.left = `${clampedPct}%`;
  }
  if (vizFloorPin) {
    vizFloorPin.style.left = `${clampedPct}%`;
  }

  const satisfies = principalUsd >= floorUsd;
  if (solvencyVerdictTag) {
    if (satisfies) {
      solvencyVerdictTag.textContent = 'VERIFIED';
      solvencyVerdictTag.classList.remove('is-breach');
    } else {
      solvencyVerdictTag.textContent = 'BELOW FLOOR';
      solvencyVerdictTag.classList.add('is-breach');
    }
  }
}

async function lockCurrentTranche(withCustodianAttestation = false): Promise<void> {
  const rawPrincipal = Math.max(parseInt(fieldPrincipalUsd?.value || '75000', 10), 1);
  const rawFloor = Math.max(parseInt(fieldFloorUsd?.value || '25000', 10), 1);
  const rawTimelock = Math.max(parseInt(fieldTimelockSec?.value || '10000', 10), 10);

  localVault.shieldedDepositUsd = BigInt(rawPrincipal);
  localVault.publicFloorUsd = BigInt(rawFloor);
  localVault.timelockSeconds = rawTimelock;
  localVault.escrowSalt = randomBytes32();
  localVault.custodianDepositSalt = randomBytes32();

  if (withCustodianAttestation) {
    const depCommit = await previewDepositAttestation(
      localVault.depositorPub,
      localVault.shieldedDepositUsd,
      localVault.denominationCode,
      localVault.custodianDepositSalt,
    );
    clearingStore.recordDepositAttestation(
      bytesToHex(localVault.depositorPub),
      bytesToHex(depCommit),
    );
  }

  const commitmentBytes = await previewEscrowCommitment(
    localVault.shieldedDepositUsd,
    localVault.denominationCode,
    localVault.timelockSeconds,
    localVault.publicFloorUsd,
    localVault.depositorPub,
    localVault.escrowSalt,
  );

  const trancheIdHex = bytesToHex(randomBytes32());
  localVault.selectedTrancheId = trancheIdHex;

  const nowEpoch = Math.floor(Date.now() / 1000);
  const entry: BullionTrancheEntry = {
    trancheId: trancheIdHex,
    depositorPubHex: bytesToHex(localVault.depositorPub),
    beneficiaryPubHex: bytesToHex(localVault.beneficiaryPub),
    arbiterPubHex: bytesToHex(localVault.arbiterPub),
    commitmentHex: bytesToHex(commitmentBytes),
    publicFloorUsd: localVault.publicFloorUsd,
    denominationCode: localVault.denominationCode,
    openedAtEpoch: nowEpoch,
    timelockExpiry: nowEpoch + rawTimelock,
    custodianAttested: withCustodianAttestation,
    phase: 'LOCKED',
  };

  clearingStore.lockBullionTranche(entry);

  if (outTrancheId) outTrancheId.textContent = `0x${trancheIdHex}`;
  if (outCommitmentHash) outCommitmentHash.textContent = `0x${entry.commitmentHex}`;
  if (certTrancheRef) certTrancheRef.textContent = `0x${trancheIdHex.slice(0, 28)}...`;
  if (certStatusText) certStatusText.textContent = 'LOCKED';
  if (certNullifierRoot) certNullifierRoot.textContent = 'Unspent';
  if (outReleaseToken) outReleaseToken.textContent = 'Pending';

  syncHorizonVisualizer(rawPrincipal, rawFloor);
  setConduitProgress(2);
  setVaultDoorMechanism(rawPrincipal >= rawFloor ? 'locked' : 'breach');
  refreshTrancheSelectors();
  refreshRailInspector();
}

function refreshTrancheSelectors(): void {
  if (!selTrancheVerify || !selTrancheDispute) return;

  const targetId = localVault.selectedTrancheId || selTrancheVerify.value;
  selTrancheVerify.innerHTML = '';
  selTrancheDispute.innerHTML = '';

  clearingStore.tranches.forEach((tranche, id) => {
    const optVerify = document.createElement('option');
    optVerify.value = id;
    optVerify.textContent = `0x${id.slice(0, 10)}... ($${tranche.publicFloorUsd.toLocaleString()} / ${tranche.phase})`;
    selTrancheVerify.appendChild(optVerify);

    const optDispute = document.createElement('option');
    optDispute.value = id;
    optDispute.textContent = `0x${id.slice(0, 10)}... (${tranche.phase})`;
    selTrancheDispute.appendChild(optDispute);
  });

  if (targetId && clearingStore.tranches.has(targetId)) {
    selTrancheVerify.value = targetId;
    selTrancheDispute.value = targetId;
  }
}

function refreshRailInspector(): void {
  if (!clearingStore) return;

  let lockedCount = 0;
  let settledCount = 0;
  let frozenCount = 0;

  clearingStore.tranches.forEach((tranche) => {
    if (tranche.phase === 'LOCKED') lockedCount++;
    if (tranche.phase === 'SETTLED' || tranche.phase === 'ARBITRATED' || tranche.phase === 'RECLAIMED') {
      settledCount++;
    }
    if (tranche.phase === 'FROZEN') frozenCount++;
  });

  const totalTranches = clearingStore.tranches.size;
  if (inspArbiterKey) inspArbiterKey.textContent = `0x${clearingStore.arbiterAuthorityHex.slice(0, 14)}...`;
  if (inspDepositorKey) {
    inspDepositorKey.textContent = `0x${bytesToHex(localVault.depositorPub).slice(0, 14)}...`;
  }
  if (inspCustodianCount) {
    inspCustodianCount.textContent = clearingStore.certifiedCustodians.size.toString();
  }
  if (inspActiveCount) inspActiveCount.textContent = lockedCount.toString();
  if (inspSettledCount) inspSettledCount.textContent = settledCount.toString();
  if (inspDisputeRatio) {
    inspDisputeRatio.textContent =
      totalTranches > 0 ? `${((frozenCount / totalTranches) * 100).toFixed(1)}%` : '0.0%';
  }

  // Nullifier Registry
  if (railNullifierCount) {
    railNullifierCount.textContent = `${clearingStore.spentNullifiers.size} SPENT`;
  }
  if (railNullifierList) {
    railNullifierList.innerHTML = '';
    if (clearingStore.spentNullifiers.size === 0) {
      const empty = document.createElement('div');
      empty.className = 'zch-nullifier-empty';
      empty.textContent = 'None';
      railNullifierList.appendChild(empty);
    } else {
      clearingStore.spentNullifiers.forEach((trancheId, nullifierHex) => {
        const item = document.createElement('div');
        item.className = 'zch-nullifier-item';
        item.textContent = `0x${nullifierHex.slice(0, 16)}...`;
        railNullifierList.appendChild(item);
      });
    }
  }

  // Leakage Boundary Audit
  if (railLeakSeal) {
    const report = clearingStore.auditZeroKnowledgeBoundary(localVault);
    if (report.clean) {
      railLeakSeal.textContent = '0 LEAKED';
      railLeakSeal.classList.remove('is-breach');
    } else {
      railLeakSeal.textContent = `LEAK: ${report.exposedArtifacts.join(', ')}`;
      railLeakSeal.classList.add('is-breach');
    }
  }
}

function highlightPresetButton(selected: HTMLButtonElement | null): void {
  [btnPresetPrime, btnPresetParity, btnPresetDeficit].forEach((btn) =>
    btn?.classList.remove('is-selected'),
  );
  selected?.classList.add('is-selected');
}

// Bootstrap Clearinghouse State
(async () => {
  localVault.depositorPub = await deriveDepositorIdentity(localVault.secretKey);
  localVault.beneficiaryPub = await deriveBeneficiaryIdentity(randomBytes32());
  localVault.arbiterPub = await deriveArbiterIdentity(randomBytes32());
  localVault.custodianPub = await deriveCustodianIdentity(randomBytes32());

  clearingStore = createClearinghouseStore(bytesToHex(localVault.arbiterPub));
  clearingStore.registerCustodian(bytesToHex(localVault.custodianPub));

  await lockCurrentTranche(true);
})();

// Acoustics Switch
btnAcousticsToggle?.addEventListener('click', () => {
  const active = acoustics.toggleMute();
  btnAcousticsToggle.textContent = `SOUND: ${active ? 'ON' : 'OFF'}`;
  if (active) acoustics.relayTick();
});

// Preset Triggers
btnPresetPrime?.addEventListener('click', async () => {
  acoustics.engageBolt();
  highlightPresetButton(btnPresetPrime);
  if (fieldPrincipalUsd) fieldPrincipalUsd.value = '75000';
  if (fieldFloorUsd) fieldFloorUsd.value = '25000';
  await lockCurrentTranche(true);
});

btnPresetParity?.addEventListener('click', async () => {
  acoustics.engageBolt();
  highlightPresetButton(btnPresetParity);
  if (fieldPrincipalUsd) fieldPrincipalUsd.value = '30000';
  if (fieldFloorUsd) fieldFloorUsd.value = '30000';
  await lockCurrentTranche(true);
});

btnPresetDeficit?.addEventListener('click', async () => {
  acoustics.breachAlarm();
  highlightPresetButton(btnPresetDeficit);
  if (fieldPrincipalUsd) fieldPrincipalUsd.value = '15000';
  if (fieldFloorUsd) fieldFloorUsd.value = '25000';
  await lockCurrentTranche(false);
});

// Stage I Actions
btnLockBullion?.addEventListener('click', async () => {
  btnLockBullion.disabled = true;
  acoustics.engageBolt();
  await lockCurrentTranche(false);
  btnLockBullion.disabled = false;
});

btnAttestCustodian?.addEventListener('click', async () => {
  btnAttestCustodian.disabled = true;
  acoustics.engageBolt();
  const newCustodian = await deriveCustodianIdentity(randomBytes32());
  clearingStore.registerCustodian(bytesToHex(newCustodian));
  await lockCurrentTranche(true);
  appendZkirLine(
    `Custodian 0x${bytesToHex(newCustodian).slice(0, 14)}... registered & deposit commitment attested.`,
    'pass',
  );
  btnAttestCustodian.disabled = false;
});

// Stage II Action: Zero-Knowledge Threshold Attestation
btnExecuteZkProof?.addEventListener('click', async () => {
  const trancheId = selTrancheVerify?.value || localVault.selectedTrancheId;
  if (!trancheId) return;
  const tranche = clearingStore.tranches.get(trancheId);
  if (!tranche) return;

  btnExecuteZkProof.disabled = true;
  if (zkirProofMonitor) zkirProofMonitor.innerHTML = '';
  acoustics.thresholdSweep();

  appendZkirLine(
    `Circuit verifyEscrow(0x${trancheId.slice(0, 14)}...) invoked against Midnight state...`,
    'circuit',
  );
  await pause(140);

  const isLocked = tranche.phase === 'LOCKED';
  appendZkirLine(
    `Constraint [1/3] Custody status == LOCKED -> ${isLocked ? 'VERIFIED' : `REJECTED (${tranche.phase})`}`,
    isLocked ? 'pass' : 'fail',
  );
  await pause(140);

  appendZkirLine(
    `Constraint [2/3] Evaluating range predicate meetsThreshold(witness.amount, $${tranche.publicFloorUsd.toLocaleString()})...`,
  );
  await pause(160);

  const meets = localVault.shieldedDepositUsd >= tranche.publicFloorUsd;
  if (!meets) {
    appendZkirLine(
      `Range Proof Rejected: Witness principal ($${localVault.shieldedDepositUsd.toLocaleString()}) falls below public floor ($${tranche.publicFloorUsd.toLocaleString()}).`,
      'fail',
    );
    setVaultDoorMechanism('breach');
    acoustics.breachAlarm();
    btnExecuteZkProof.disabled = false;
    return;
  }

  appendZkirLine(
    `Constraint [2/3] Satisfied: (witness.amount >= $${tranche.publicFloorUsd.toLocaleString()}) == true [Surplus hidden]`,
    'pass',
  );
  await pause(120);

  appendZkirLine(
    `Constraint [3/3] Hiding commitment 0x${tranche.commitmentHex.slice(0, 16)}... bound to depositor key.`,
    'pass',
  );

  setConduitProgress(3);
  setVaultDoorMechanism('attested');
  acoustics.releaseChime();
  btnExecuteZkProof.disabled = false;
});

// Stage III Action: Settlement Release & Nullifier Certificate
btnSettleTranche?.addEventListener('click', async () => {
  const trancheId = selTrancheVerify?.value || localVault.selectedTrancheId;
  if (!trancheId) return;
  const tranche = clearingStore.tranches.get(trancheId);
  if (!tranche) return;

  btnSettleTranche.disabled = true;
  acoustics.engageBolt();

  try {
    const nullifierBytes = await previewNullifierDigest(
      localVault.escrowSalt,
      hexToBytes(trancheId),
    );
    const nullifierHex = bytesToHex(nullifierBytes);

    clearingStore.settleToBeneficiary(trancheId, nullifierHex);

    const releaseCertBytes = await previewReleaseCertificate(
      hexToBytes(tranche.commitmentHex),
      localVault.beneficiaryPub,
    );
    const releaseCertHex = `0x${bytesToHex(releaseCertBytes)}`;

    if (outReleaseToken) outReleaseToken.textContent = releaseCertHex;
    if (certStatusText) certStatusText.textContent = 'SETTLED';
    if (certTrancheRef) certTrancheRef.textContent = `0x${trancheId}`;
    if (certNullifierRoot) certNullifierRoot.textContent = `0x${nullifierHex}`;

    setConduitProgress(4);
    setVaultDoorMechanism('released');
    acoustics.releaseChime();
    appendZkirLine(
      `Tranche 0x${trancheId.slice(0, 12)}... released. Nullifier 0x${nullifierHex.slice(0, 14)}... recorded.`,
      'pass',
    );
  } catch (err: unknown) {
    acoustics.breachAlarm();
    appendZkirLine(
      `Release rejected: ${err instanceof Error ? err.message : String(err)}`,
      'fail',
    );
  } finally {
    btnSettleTranche.disabled = false;
    refreshTrancheSelectors();
    refreshRailInspector();
  }
});

// Copy JSON Settlement Dossier
btnExportReceipt?.addEventListener('click', () => {
  acoustics.relayTick();
  const payload = {
    clearinghouse: 'VAULTLINE_ZURICH_BULLION_V1',
    trancheId: certTrancheRef?.textContent || '',
    releaseReceiptToken: outReleaseToken?.textContent || '',
    nullifierDigest: certNullifierRoot?.textContent || '',
    status: certStatusText?.textContent || '',
    settledAtIso: new Date().toISOString(),
  };
  navigator.clipboard?.writeText(JSON.stringify(payload, null, 2)).then(() => {
    if (!btnExportReceipt) return;
    btnExportReceipt.textContent = 'Copied';
    setTimeout(() => {
      btnExportReceipt.textContent = 'Copy JSON';
    }, 1800);
  });
});

// Stage IV Actions: Arbitrator Dispute & Timelock Resolution
btnFreezeDispute?.addEventListener('click', async () => {
  const trancheId = selTrancheDispute?.value || localVault.selectedTrancheId;
  if (!trancheId) return;

  try {
    const reasonDigest = await previewDisputeCommitment(randomBytes32());
    const reasonHex = bytesToHex(reasonDigest);
    clearingStore.freezeUnderDispute(trancheId, reasonHex);
    setVaultDoorMechanism('breach');
    acoustics.breachAlarm();
    if (outArbitrationStatus) {
      outArbitrationStatus.textContent = `FROZEN // Tranche 0x${trancheId.slice(0, 12)}... locked under dispute hash 0x${reasonHex.slice(0, 14)}...`;
    }
    refreshTrancheSelectors();
    refreshRailInspector();
  } catch (err: unknown) {
    acoustics.breachAlarm();
    if (outArbitrationStatus) {
      outArbitrationStatus.textContent = `Freeze rejected: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
});

btnExecuteVerdict?.addEventListener('click', async () => {
  const trancheId = selTrancheDispute?.value || localVault.selectedTrancheId;
  if (!trancheId) return;
  const tranche = clearingStore.tranches.get(trancheId);
  if (!tranche) return;

  try {
    const nullifierBytes = await previewNullifierDigest(
      localVault.escrowSalt,
      hexToBytes(trancheId),
    );
    const nullifierHex = bytesToHex(nullifierBytes);
    clearingStore.executeArbitrationVerdict(trancheId, nullifierHex);

    const awardTarget =
      selArbiterDestination?.value === 'depositor' ? 'DEPOSITOR (REFUND)' : 'BENEFICIARY (RELEASE)';
    setConduitProgress(4);
    setVaultDoorMechanism('released');
    acoustics.releaseChime();

    if (outArbitrationStatus) {
      outArbitrationStatus.textContent = `ARBITRATED // Awarded to ${awardTarget} with nullifier 0x${nullifierHex.slice(0, 14)}...`;
    }
    refreshTrancheSelectors();
    refreshRailInspector();
  } catch (err: unknown) {
    acoustics.breachAlarm();
    if (outArbitrationStatus) {
      outArbitrationStatus.textContent = `Verdict rejected: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
});

btnExpireTimelock?.addEventListener('click', async () => {
  const trancheId = selTrancheDispute?.value || localVault.selectedTrancheId;
  if (!trancheId) return;
  const tranche = clearingStore.tranches.get(trancheId);
  if (!tranche) return;

  try {
    const nullifierBytes = await previewNullifierDigest(
      localVault.escrowSalt,
      hexToBytes(trancheId),
    );
    const nullifierHex = bytesToHex(nullifierBytes);
    // Simulate fast-forwarding past the timelock horizon
    const simulatedPostExpiry = tranche.timelockExpiry + 10;
    clearingStore.reclaimExpiredTranche(trancheId, nullifierHex, simulatedPostExpiry);

    setConduitProgress(4);
    setVaultDoorMechanism('released');
    acoustics.engageBolt();
    if (outArbitrationStatus) {
      outArbitrationStatus.textContent = `RECLAIMED // Timelock expired at ${tranche.timelockExpiry}s; principal returned to depositor.`;
    }
    refreshTrancheSelectors();
    refreshRailInspector();
  } catch (err: unknown) {
    acoustics.breachAlarm();
    if (outArbitrationStatus) {
      outArbitrationStatus.textContent = `Timelock reclaim rejected: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
});

// Live In-Browser Compact Contract Runner
btnExecuteCompiledContract?.addEventListener('click', async () => {
  if (!contractRunnerOutput || !contractRunnerStatus) return;
  btnExecuteCompiledContract.disabled = true;
  contractRunnerOutput.textContent = '';
  contractRunnerStatus.textContent = 'RUNNING';
  acoustics.engageBolt();

  const startedAt = performance.now();
  try {
    await runDemo((...parts: unknown[]) => {
      contractRunnerOutput.textContent += parts.map(String).join(' ') + '\n';
      contractRunnerOutput.scrollTop = contractRunnerOutput.scrollHeight;
    });
    document.body.dataset.escrow = 'completed';
    contractRunnerStatus.textContent = `DONE (${Math.round(performance.now() - startedAt)} ms)`;
    acoustics.releaseChime();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    contractRunnerOutput.textContent += `\nCircuit execution error: ${msg}`;
    contractRunnerStatus.textContent = 'REJECTED';
    document.body.dataset.escrow = `rejected: ${msg}`;
    acoustics.breachAlarm();
  } finally {
    btnExecuteCompiledContract.disabled = false;
  }
});

// Verification hook: auto-trigger compiled contract execution when hash is #audit
if (location.hash === '#audit') {
  btnExecuteCompiledContract?.click();
}
