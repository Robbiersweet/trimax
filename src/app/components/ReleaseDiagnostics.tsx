import manifest from '../../../release/trimax-release-manifest.json';
import { authenticatedOcrInvestigator, requireOcrAdmin } from '../lib/ocrDebugServer';

type Attestation = { releaseId?: string; sourceCommit?: string; sourceBundle?: string; modelBundle?: string; runtimeSources?: string; databaseFingerprint?: string; validatedAt?: string };
export default async function ReleaseDiagnostics({businessId}:{businessId:string}) {
  const client=await authenticatedOcrInvestigator();
  await requireOcrAdmin(client,businessId);
  const {data,error}=await client.rpc('trimax_release_runtime',{p_business:businessId,p_engine:'diagnostics'});
  const legacy=data?.legacyRelease as Attestation | undefined, v2=data?.v2Release as Attestation | undefined;
  const matches=(value:Attestation|undefined)=>value?.releaseId===manifest.releaseId && value.sourceCommit===manifest.components.web.commit && value.sourceBundle===manifest.sourceBundle.sha256 && value.modelBundle===manifest.modelBundle.sha256 && value.runtimeSources===manifest.runtimeSources.sha256 && value.databaseFingerprint===manifest.database.fingerprints.schema.sha256;
  const databaseMatches=Object.entries(manifest.database.fingerprints).every(([kind,value])=>data?.fingerprints?.[kind]?.sha256===value.sha256);
  const drift=!!error || !matches(legacy) || !matches(v2) || !databaseMatches;
  return <section aria-label="Release identity" className="rounded-xl border border-white/20 p-4 text-sm">
    <h2 className="font-semibold">Release {manifest.releaseId}</h2>
    <p className={drift?'text-amber-300':'text-green-300'}>{drift?'RUNTIME DRIFT DETECTED':'Recorded release identities match'}</p>
    <p>Web source: {manifest.components.web.commit} · Build: {process.env.NEXT_PUBLIC_TRIMAX_BUILD ?? 'unverified'}</p>
    <p>Legacy worker: {legacy?.sourceCommit ?? 'No release attestation'}</p>
    <p>V2 worker: {v2?.sourceCommit ?? 'No release attestation'}</p>
    <p className="break-all">Model bundle: {manifest.modelBundle.sha256}</p>
    <p className="break-all">Database: {data?.fingerprints?.schema?.sha256 ?? 'Unverified'}</p>
    <p>Worker identities are last-job observations, not live health. Physical acceptance: PENDING.</p>
  </section>;
}
