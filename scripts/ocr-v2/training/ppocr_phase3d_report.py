"""Summarize saved results only. Never runs additional reserved inference."""
import argparse,json
from pathlib import Path

def metrics(rows):
    n=sum(r['characters'] for r in rows);distance=sum(r['distance'] for r in rows)
    return {'rows':len(rows),'exact':sum(r['exact'] for r in rows),'characterAccuracy':1-distance/n,'CER':distance/n,**{k:sum(r[k] for r in rows) for k in ['substitutions','insertions','deletions']}}

def main(root,previous):
    read=lambda f:json.loads((root/f).read_text());report={'selection':read('selected.json'),'trainingSeconds':read('training.json')['history'][-1]['elapsedSeconds'],'audit':read('audit.json'),'performance':read('performance.json'),'reservedComparisons':{},'amountTotalEvidenceUnchanged':{'developmentAmounts':'17/17','developmentTotals':'5/6','reservedAmounts':'4/7','reservedTotals':'1/2','discrepancy':'Request says 2/2 reserved totals; frozen observations have no valid B total.'}}
    for engine in ['generic','pilot','ppocr','crnn']:
        report['reservedComparisons'][engine]=json.loads((previous/('holdout-'+engine+'.json')).read_text())['groups']
    for name,file in [('genericMatched','holdout-matched-generic.json'),('fineTuned','holdout-evaluation.json')]:
        rows=read(file)['rows'];report['reservedComparisons'][name]={kind:metrics([r for r in rows if r['kind']==kind]) for kind in ['auto','manual']}
    report['fixtureB']={kind:metrics([r for r in read('holdout-evaluation.json')['rows'] if r['kind']==kind and r['documentId']=='B']) for kind in ['auto','manual']}
    m=report['reservedComparisons']['fineTuned']['auto'];report['preferredInvoiceGate']=m['exact']/m['rows']>=.9 and m['characterAccuracy']>=.95;report['phase4Ready']=False
    (root/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('root',type=Path);p.add_argument('previous',type=Path);a=p.parse_args();main(a.root,a.previous)
