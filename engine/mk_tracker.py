import pandas as pd,numpy as np,json,datetime
from openpyxl import Workbook,load_workbook
from openpyxl.styles import Font,PatternFill,Alignment
from openpyxl.utils import get_column_letter as L
R=json.load(open('cards/franklin_rates.json'));order=R['order'];tab=R['tab']
f=pd.read_pickle('fti.pkl')
f['folio']=f.FOLIO_NO.str.replace(r'\.0$','',regex=True)
f['isadd']=f.TRXN_DESC.fillna('').str.contains('Additional',case=False)
k=['folio','SCHEME_COD','TRXN_NO','BRKAGE_FRO','BRKAGE_TO']
tr=f[~f.isadd]
lot=tr.groupby(k).agg(abbr=('abbr','first'),name=('INV_NAME','first'),td=('td','first'),aum=('AVG_ASSETS','max'),days=('NO_OF_DAYS','first'),rate=('BRKAGE_RAT','sum'),amt=('BRKAGE_AMT','sum')).reset_index()
ad=f[f.isadd].groupby(k).agg(addamt=('BRKAGE_AMT','sum')).reset_index()
lot=lot.merge(ad,on=k,how='left').fillna({'addamt':0})
_a=f[f.isadd].groupby(k).agg(abbr=('abbr','first'),name=('INV_NAME','first'),td=('td','first'),aum=('AVG_ASSETS','max'),days=('NO_OF_DAYS','first'),addamt=('BRKAGE_AMT','sum')).reset_index()
_a=_a.merge(lot[k],on=k,how='left',indicator=True);_a=_a[_a._merge=='left_only'].drop(columns='_merge')
_a['rate']=0.0;_a['amt']=0.0
lot=pd.concat([lot,_a],ignore_index=True)
qs=lambda d:pd.Timestamp(d.year,((d.month-1)//3)*3+1,1)
st=[datetime.datetime.strptime(s,'%d-%b-%Y') for s in order]
cardq={qs(s):o for s,o in zip(st,order)}
lot['qs']=lot.td.map(qs);lot['ck']=lot.qs.map(cardq)
lot['crate']=[tab.get(a,{}).get(c) if isinstance(c,str) else None for a,c in zip(lot.abbr,lot.ck)]
lot['q']=lot.td.map(lambda t:['Jan-Mar','Apr-Jun','Jul-Sep','Oct-Dec'][(t.month-1)//3]+' '+str(t.year))
lot=lot.sort_values(['td'],ascending=False)
wb=Workbook();A='Arial'
H=PatternFill('solid',fgColor='1F3864');hf=Font(name=A,bold=True,color='FFFFFF')
def hdr(ws,r,cols):
    for i,c in enumerate(cols,1):
        x=ws.cell(r,i,c);x.font=hf;x.fill=H;x.alignment=Alignment(wrap_text=True,vertical='center')
ws=wb.active;ws.title='Franklin lot diff'
ws['A1']='Franklin Oct-2026 payout, lot by lot: paid rate vs card rate for the lot\'s own trade quarter';ws['A1'].font=Font(name=A,bold=True,size=12)
ws['A2']='Rates % p.a. Expected = AUM x card rate/100 x days/365. Card = "Day 1 onwards" column of the quarter\'s remuneration structure. Older-lot results are pointers: paid rates rarely match the original-quarter card (see Summary).';ws['A2'].font=Font(name=A,italic=True)
cols=['Trade date','Trade qtr','Folio','Client','Fund code','Avg assets','Days','Paid rate %','Card rate %','Trail paid','Expected','Diff (paid-exp)','Additional paid','Status']
hdr(ws,4,cols);r0=5
for i,x in enumerate(lot.itertuples(),r0):
    ws.cell(i,1,x.td.to_pydatetime()).number_format='dd-mmm-yy'
    ws.cell(i,2,x.q);ws.cell(i,3,x.folio);ws.cell(i,4,' '.join(str(x.name).split()));ws.cell(i,5,x.abbr)
    ws.cell(i,6,float(x.aum)).number_format='#,##0';ws.cell(i,7,int(x.days))
    ws.cell(i,8,round(float(x.rate),4)).number_format='0.000'
    if x.crate is not None and x.crate==x.crate: ws.cell(i,9,float(x.crate)).number_format='0.00'
    ws.cell(i,10,round(float(x.amt),2)).number_format='#,##0.00'
    ws.cell(i,11,f'=IF(I{i}="","",F{i}*I{i}/100*G{i}/365)').number_format='#,##0.00'
    ws.cell(i,12,f'=IF(I{i}="","",J{i}-K{i})').number_format='#,##0.00;[Red](#,##0.00);-'
    ws.cell(i,13,round(float(x.addamt),2)).number_format='#,##0.00'
    ws.cell(i,14,f'=IF(AND(J{i}=0,M{i}>0),"Additional only",IF(I{i}="","No card",IF(ABS(H{i}/I{i}-1)<=0.005,"OK",IF(AND(H{i}/I{i}>1.17,H{i}/I{i}<1.19),"GST-like",IF(H{i}<I{i},"Below","Above")))))')
last=r0+len(lot)-1
for i,w in enumerate([11,12,12,28,9,12,6,9,9,11,11,12,11,10],1): ws.column_dimensions[L(i)].width=w
ws.freeze_panes='A5';ws.auto_filter.ref=f'A4:N{last}'
for row in ws.iter_rows(min_row=1,max_row=last):
    for c in row:
        if c.font.name!=A: c.font=Font(name=A,bold=c.font.bold,italic=c.font.italic,size=c.font.size,color=c.font.color)
# card rates
w2=wb.create_sheet('Franklin card rates');w2['A1']='Franklin "Day 1 onwards" trail rate % p.a. by quarter (from emailed remuneration structures, ARN-263998)';w2['A1'].font=Font(name=A,bold=True)
hdr(w2,3,['Fund code']+order)
for i,(c,v) in enumerate(sorted(tab.items()),4):
    w2.cell(i,1,c)
    for j,o in enumerate(order,2):
        if o in v: w2.cell(i,j,v[o]).number_format='0.00'
for row in w2.iter_rows():
    for c in row: c.font=Font(name=A,bold=c.font.bold,color=c.font.color)
w2.column_dimensions['A'].width=12
# coverage
w3=wb.create_sheet('Card coverage');hdr(w3,1,['Quarter','Card received','Franklin lots traded in quarter'])
cnt=lot.groupby('qs').size()
allq=pd.period_range('2003-10','2026-12',freq='Q')
for i,p in enumerate(allq[::-1],2):
    t=p.start_time;w3.cell(i,1,f'{p.year} Q{p.quarter}');w3.cell(i,2,'Yes' if t in cardq else 'No');w3.cell(i,3,int(cnt.get(t,0)))
for row in w3.iter_rows():
    for c in row: c.font=Font(name=A,bold=c.font.bold,color=c.font.color)
w3.column_dimensions['C'].width=28

w4=wb.create_sheet('Folio-scheme total',1)
w4['A1']='Per folio + fund: trail and Additional Brokerage together (Additional is intentional per MoneyKonnect, so it counts as received income)';w4['A1'].font=Font(name=A,bold=True)
hdr(w4,3,['Folio','Fund code','Client','Trail paid','Additional paid','Total received','Expected trail (lots with card)','Trail diff on carded lots','Lots'])
g=lot.groupby(['folio','abbr']).agg(name=('name','first')).reset_index().sort_values(['name','folio'])
rng=lambda c:f"'Franklin lot diff'!${c}${r0}:${c}${last}"
for i,x in enumerate(g.itertuples(),4):
    w4.cell(i,1,x.folio);w4.cell(i,2,x.abbr);w4.cell(i,3,' '.join(str(x.name).split()))
    w4.cell(i,4,f'=SUMIFS({rng("J")},{rng("C")},A{i},{rng("E")},B{i})').number_format='#,##0.00'
    w4.cell(i,5,f'=SUMIFS({rng("M")},{rng("C")},A{i},{rng("E")},B{i})').number_format='#,##0.00'
    w4.cell(i,6,f'=D{i}+E{i}').number_format='#,##0.00'
    w4.cell(i,7,f'=SUMIFS({rng("K")},{rng("C")},A{i},{rng("E")},B{i})').number_format='#,##0.00'
    w4.cell(i,8,f'=SUMIFS({rng("L")},{rng("C")},A{i},{rng("E")},B{i})').number_format='#,##0.00;[Red](#,##0.00);-'
    w4.cell(i,9,f'=COUNTIFS({rng("C")},A{i},{rng("E")},B{i})')
tl=3+len(g)
w4.cell(tl+1,3,'Total').font=Font(name=A,bold=True)
for c in 'DEFG': w4[f'{c}{tl+1}']=f'=SUM({c}4:{c}{tl})';w4[f'{c}{tl+1}'].number_format='#,##0'
for row in w4.iter_rows():
    for c in row: c.font=Font(name=A,bold=c.font.bold,color=c.font.color)
for i,w in enumerate([12,10,28,12,12,12,16,16,6],1): w4.column_dimensions[L(i)].width=w
w4.freeze_panes='A4';w4.auto_filter.ref=f'A3:I{tl}'

# summary
s=wb.create_sheet('Summary',0)
rows=[('Brokerage reconciliation tracker - MoneyKonnect LLP (ARN-263998)',),('Built 17-Nov-2026 from: CAMS payout CSV (Oct-2026), holdings file (13-Nov-2026), Franklin rate cards from Gmail (22 emails).',),(),
('Franklin lots in payout',f"=COUNTA('Franklin lot diff'!C{r0}:C{last})"),
('Lots with a card for their trade quarter',f"=COUNTIF('Franklin lot diff'!N{r0}:N{last},\"<>No card\")-COUNTIF('Franklin lot diff'!N{r0}:N{last},\"Additional only\")"),
('Lots with Additional brokerage only (no trail row)',f"=COUNTIF('Franklin lot diff'!N{r0}:N{last},\"Additional only\")"),
('  Status OK (within 0.005)',f"=COUNTIF('Franklin lot diff'!N{r0}:N{last},\"OK\")"),
('  Status Below card',f"=COUNTIF('Franklin lot diff'!N{r0}:N{last},\"Below\")"),
('  Status Above card',f"=COUNTIF('Franklin lot diff'!N{r0}:N{last},\"Above\")"),
('  Status GST-like (paid ~ card x 1.18)',f"=COUNTIF('Franklin lot diff'!N{r0}:N{last},\"GST-like\")"),
('Shortfall on Below lots (Rs)',f"=-SUMIF('Franklin lot diff'!N{r0}:N{last},\"Below\",'Franklin lot diff'!L{r0}:L{last})"),
('Excess on Above lots (Rs)',f"=SUMIF('Franklin lot diff'!N{r0}:N{last},\"Above\",'Franklin lot diff'!L{r0}:L{last})"),
(),('Read this first',),
('1. Card quarters missing: Q1 2024, Q3 2024, Q4 2024, Q1 2026 and everything before Feb 2023. Those lots show "No card".',),
('2. For lots older than 1 Oct 2026, paid rate almost never equals their own-quarter card. Franklin appears to pay on the structure at payout time. Below/Above here are pointers, not proven shortfalls.',),
('3. Lots traded on or after 1 Oct 2026 match the Oct-Dec 2026 card; confirmed shortfall there is about Rs 1.',),
('4. Additional Brokerage is intentional (confirmed by MoneyKonnect) and is added to the same folio + fund in the Folio-scheme total sheet.',),
('5. Other AMCs: only Feb/Mar 2025 statement consistency is covered (see amc_rate_consistency.xlsx). Their rate cards are not downloaded yet.',)]
for i,r in enumerate(rows,1):
    for j,v in enumerate(r,1):
        c=s.cell(i,j,v);c.font=Font(name=A,bold=(i in(1,13)),size=12 if i==1 else 10)
        if j==2: c.number_format='#,##0'
s.column_dimensions['A'].width=70;s.column_dimensions['B'].width=14
wb.save('out/brokerage_tracker.xlsx');print(len(lot))
