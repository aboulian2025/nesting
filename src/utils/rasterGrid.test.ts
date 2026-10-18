import assert from 'node:assert/strict';
import {test} from 'node:test';
import {RasterGrid} from './rasterGrid.ts';

test('raster ranges match an independent cell array across word boundaries',()=>{
  const grid=new RasterGrid(103,3),cells=Array.from({length:3},()=>Array(103).fill(false));
  for(const [row,left,right] of [[0,0,0],[0,31,33],[0,63,64],[1,-8,5],[1,95,140],[2,7,23]]) {
    grid.fill(row,left,right);
    for(let x=Math.max(0,left);x<=Math.min(102,right);x++)cells[row][x]=true;
  }
  for(let row=-1;row<=3;row++)for(let left=-2;left<105;left++)for(let right=left;right<107;right++){
    let expected=-1;
    if(row>=0&&row<3)for(let x=Math.min(102,right);x>=Math.max(0,left);x--)if(cells[row][x]){expected=x;break;}
    assert.equal(grid.lastOccupied(row,left,right),expected,`${row}:${left}/${right}`);
  }
});

test('collision jumps skip only positions blocked by the same occupied cell',()=>{
  const grid=new RasterGrid(97,1);
  for(const x of [3,9,31,32,47,64,95])grid.fill(0,x,x);
  for(const [left,right] of [[0,4],[-2,6],[7,19]])for(let start=0;start<70;start++){
    const block=grid.lastOccupied(0,start+left,start+right);
    if(block<0)continue;
    const next=block-left+1;
    for(let x=start;x<next;x++)assert.ok(grid.lastOccupied(0,x+left,x+right)>=0);
  }
});
