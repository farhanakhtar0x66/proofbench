export type VersionFact={entity:string;kind:'version';value:string;scope:string};
const entityPattern="[\\p{L}][\\p{L}\\p{N} &-]{1,80}?";
const componentPattern='api|sdk|mobile application|mobile app|web application|web app|desktop application|desktop app|application|app';
const versionPattern='v?\\d+(?:\\.\\d+){0,3}(?:-(?:alpha|beta|preview|rc)(?:[.\\d-]*))?';
const forward=new RegExp(`^(?<entity>${entityPattern})(?:'s)? (?:(?<time>latest|current) )?(?:(?<channel>stable|beta|alpha|preview|rc) )?(?:(?<component>${componentPattern}) )?(?:version|release) is (?<value>${versionPattern})$`,'iu');
const inverted=new RegExp(`^The (?<time>latest|current) (?:(?<channel>stable|beta|alpha|preview|rc) )?(?:version|release) of (?<entity>${entityPattern})(?:'s)?(?: (?<component>${componentPattern}))? is (?<value>${versionPattern})$`,'iu');

export function parseVersion(text:string):VersionFact|undefined{
 const normalized=text.trim().replace(/[.!]$/u,'').replace(/’/gu,"'");
 const match=normalized.match(forward)??normalized.match(inverted);
 if(!match?.groups)return;
 const groups=match.groups;
 if(!groups.time&&!groups.channel)return;
 let entity=groups.entity.trim().toLowerCase().replace(/\s+/gu,' ');
 let component=groups.component?.toLowerCase().replace(/\bapplication\b/u,'app')??'unspecified';
 const suffix=entity.match(new RegExp(`\\s+(${componentPattern})$`,'iu'));
 if(suffix){
  const suffixComponent=suffix[1].replace(/\bapplication\b/u,'app');
  if(component!=='unspecified'&&component!==suffixComponent)return;
  component=suffixComponent;entity=entity.slice(0,-suffix[0].length).trim();
 }
 if(!entity)return;
 const value=groups.value.toLowerCase().replace(/^v/u,'');
 const prerelease=value.match(/-(alpha|beta|preview|rc)/u)?.[1];
 if(prerelease&&groups.channel&&groups.channel.toLowerCase()!==prerelease)return;
 const channel=groups.channel?.toLowerCase()??prerelease??'unspecified';
 return {entity,kind:'version',value,scope:`version/${component}/${channel}`};
}
