import {type AgentAdapter,UnsupportedCapability} from '../../../packages/contracts/src/index';
// Farhan replaces this module through a reviewed PR. Never substitute mock success.
export const bifrost02:AgentAdapter={
 descriptor:{version:'1',id:'bifrost-02',name:'Identical-task benchmark engine',implementation:'02',runtime:'typescript',revision:'unintegrated',model:null},
 capabilities:{execute:false,benchmarks:false,verify:true,native:false},
 async run(_request){throw new UnsupportedCapability('Bifrost #02 not integrated');}
};
