"""Repository entry point: prepare/resume a paired campaign and publish its public results."""
import argparse,json,pathlib,subprocess,sys

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--dashboard',type=pathlib.Path,required=True);p.add_argument('--peer',type=pathlib.Path,help='Other application checkout: API for harness, harness for API');p.add_argument('--campaign',type=pathlib.Path,required=True,help='Private output directory outside public source');p.add_argument('--local',action='store_true');p.add_argument('--cloud-campaign',type=pathlib.Path);p.add_argument('--no-publish',action='store_true');a=p.parse_args()
 repo=pathlib.Path(__file__).resolve().parents[1];project=json.loads((repo/'benchmarks/dashboard/config.json').read_text())['project'];dashboard=a.dashboard.resolve();peer=a.peer.resolve() if a.peer else None;out=a.campaign.resolve()
 if project not in ('harness','api'):raise SystemExit('Controlled generation supports only harness and API')
 for root in [r for r in [repo,peer,dashboard] if r is not None]:
  if out==root or root in out.parents:raise SystemExit('Choose a private campaign directory outside all source checkouts')
 scripts=dashboard/'trials'
 for name in ['run.py','evaluate.py','publish.py']:
  if not (scripts/name).is_file():raise SystemExit('Dashboard trial runner missing')
 def execute(args):subprocess.run([sys.executable,*map(str,args)],check=True)
 if a.local:
  if project!='api' or not a.cloud_campaign:raise SystemExit('Local API trials need --cloud-campaign')
  if not (out/'plan.json').exists():execute([scripts/'local.py','prepare','--cloud',a.cloud_campaign.resolve(),'--output',out])
  execute([scripts/'local.py','generate','--output',out]);execute([scripts/'evaluate.py','--output',out])
  if not a.no_publish:execute([scripts/'publish.py','--output',out,'--project','api'])
  return
 if not peer:raise SystemExit('Cloud trials require --peer')
 harness=repo if project=='harness' else peer;api=peer if project=='harness' else repo
 if not (out/'plan.json').exists():execute([scripts/'run.py','prepare','--output',out,'--harness',harness,'--api',api])
 execute([scripts/'run.py','generate','--output',out]);execute([scripts/'evaluate.py','--output',out])
 if not a.no_publish:
  for target in ['harness','api']:execute([scripts/'publish.py','--output',out,'--project',target])
if __name__=='__main__':main()
