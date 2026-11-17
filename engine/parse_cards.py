import re,glob,json,os,sys
files={}
for f in sorted(glob.glob('/tmp/fr/*.txt')):
    t=open(f).read()
    m=re.search(r'period\s+(\d\d-\w{3}-\d{4})\s+to\s+(\d\d-\w{3}-\d{4})',t)
    if not m: continue
    key=(m.group(1),m.group(2),'SIF' if 'SIF' in t[:600] else '')
    files.setdefault(key,[]).append(f)
out={}
for key,fs in files.items():
    f=fs[0]; rows=[]
    for line in open(f):
        m=re.match(r'\s*(\d+)\)\s+(.+?)\s{2,}(.*)$',line)
        if not m: continue
        nums=re.findall(r'(?<![\w.])(\d+\.\d+|\d+)(?![\w.%])',m.group(3))
        nums=[float(x) for x in nums[-6:]] if nums else []
        rows.append((m.group(2).strip(),nums))
    out['|'.join(key)]={'files':fs,'rows':rows}
    print(key,len(fs),len(rows))
json.dump(out,open('/tmp/work/cards/franklin_cards.json','w'))
