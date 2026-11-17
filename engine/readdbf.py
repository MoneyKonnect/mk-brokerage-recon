import struct, pandas as pd
def read_dbf(p):
    f=open(p,'rb'); h=f.read(32)
    n=struct.unpack('<I',h[4:8])[0]; hl=struct.unpack('<H',h[8:10])[0]; rl=struct.unpack('<H',h[10:12])[0]
    fields=[]
    while True:
        d=f.read(32)
        if d[0]==0x0D: break
        fields.append((d[:11].split(b'\0')[0].decode(),chr(d[11]),d[16]))
    f.seek(hl); rows=[]
    for _ in range(n):
        r=f.read(rl)
        if r[:1]==b'*': continue
        o=1; row=[]
        for name,t,l in fields:
            row.append(r[o:o+l].decode('latin1').strip()); o+=l
        rows.append(row)
    return pd.DataFrame(rows,columns=[x[0] for x in fields])
