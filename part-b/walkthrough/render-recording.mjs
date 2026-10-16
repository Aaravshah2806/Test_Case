import {readFileSync,writeFileSync,mkdirSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const root=dirname(fileURLToPath(import.meta.url));
process.chdir(root);
const {scenes}=JSON.parse(readFileSync('recording.json','utf8'));
const ffmpeg=process.env.FFMPEG_BIN || 'ffmpeg';
mkdirSync('encoded',{recursive:true});mkdirSync('captions',{recursive:true});
let elapsed=0;const subtitles=[],chapters=[];
const timestamp=value=>{const ms=Math.round(value*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
for(const scene of scenes){
  if(!scene.frames.length)throw new Error(`Scene ${scene.id} has no recorded frames.`);
  const key=String(scene.id).padStart(2,'0');
  const step=scene.duration/scene.frames.length;
  const lines=['ffconcat version 1.0'];
  for(const frame of scene.frames){if(!/^frames\/\d+\.jpg$/.test(frame))throw new Error('Unexpected recording filename.');statSync(frame);lines.push(`file '../${frame}'`,`duration ${step.toFixed(9)}`);}
  lines.push(`file '../${scene.frames.at(-1)}'`);
  writeFileSync(`encoded/${key}.ffconcat`,lines.join('\n')+'\n');
  writeFileSync(`captions/${key}-title.txt`,scene.title);
  writeFileSync(`captions/${key}-description.txt`,scene.subtitle);
  const filter=`scale=1920:960:force_original_aspect_ratio=decrease,pad=1920:960:(ow-iw)/2:(oh-ih)/2:color=0xf5f3ec,pad=1920:1080:0:0:color=0x234d3c,drawtext=fontfile=assets/semibold.ttf:textfile=captions/${key}-title.txt:fontsize=32:fontcolor=0xdce8aa:x=48:y=980,drawtext=fontfile=assets/regular.ttf:textfile=captions/${key}-description.txt:fontsize=24:fontcolor=white:x=48:y=1027`;
  execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-safe','0','-f','concat','-i',`encoded/${key}.ffconcat`,'-vf',filter,'-r','30','-t',String(scene.duration),'-an','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',`encoded/${key}.mp4`],{stdio:['ignore','ignore','inherit']});
  chapters.push({start:elapsed,end:elapsed+scene.duration,title:scene.title});
  subtitles.push(`${scene.id}\n${timestamp(elapsed)} --> ${timestamp(elapsed+scene.duration)}\n${scene.title}\n${scene.subtitle}\n`);
  elapsed+=scene.duration;
  console.log(`Encoded scene ${scene.id}/${scenes.length}: ${scene.title}`);
}
writeFileSync('encoded/join.ffconcat',['ffconcat version 1.0',...scenes.map(s=>`file '${String(s.id).padStart(2,'0')}.mp4'`)].join('\n')+'\n');
writeFileSync('chapters.srt',subtitles.join('\n'));
writeFileSync('chapters.json',JSON.stringify(chapters,null,2));
execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-safe','0','-f','concat','-i','encoded/join.ffconcat','-c','copy','-movflags','+faststart','slotbook-walkthrough.mp4'],{stdio:['ignore','ignore','inherit']});
console.log(`Complete: ${resolve('slotbook-walkthrough.mp4')} (${elapsed} seconds, 1920x1080, 30 fps)`);
