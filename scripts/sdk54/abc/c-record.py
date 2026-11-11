#!/usr/bin/env python3
"""Record one replayable command; never stage or commit. Usage: --output DIR --label ID -- COMMAND..."""
import argparse, datetime, hashlib, json, os, pathlib, subprocess, sys, time
p=argparse.ArgumentParser()
p.add_argument('--output',required=True); p.add_argument('--label',required=True)
p.add_argument('--timeout',type=int,default=3600); p.add_argument('command',nargs=argparse.REMAINDER)
a=p.parse_args(); command=a.command[1:] if a.command[:1]==['--'] else a.command
root=pathlib.Path(a.output); root.mkdir(parents=True,exist_ok=True)
if not a.label.replace('-','').replace('_','').isalnum(): p.error('unsafe label')
logs=[root/(a.label+'.'+x) for x in ['stdout','stderr']]
start=datetime.datetime.now(datetime.timezone.utc).isoformat(); timed=False
with logs[0].open('xb') as out, logs[1].open('xb') as err:
 try:
  proc=subprocess.run(command,stdout=out,stderr=err,timeout=a.timeout)
  code=proc.returncode
 except subprocess.TimeoutExpired: code=124; timed=True
end=datetime.datetime.now(datetime.timezone.utc).isoformat()
record={'argv':command,'cwd':os.getcwd(),'startedAt':start,'endedAt':end,'exitCode':code if code>=0 else None,'signal':-code if code<0 else None,'timedOut':timed,
'tools':{k:subprocess.getoutput(v) for k,v in {'node':'node --version','pnpm':'corepack pnpm --version','python':'python3 --version'}.items()}}
for key,file in zip(['stdout','stderr'],logs): record[key]={'path':file.name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
file=root/'commands.json'; rows=json.loads(file.read_text()) if file.exists() else []
rows.append(record); file.write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps({'label':a.label,'exitCode':code,'timedOut':timed}))
sys.exit(code if code>=0 else 1)
