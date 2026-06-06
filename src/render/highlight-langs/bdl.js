/*
Language: BDL
Author: Jörg Brandeis <joerg@brandeis.de>
Description: BDL for CDS ABAP
*/

export default function(hljs) {

  return {
    case_insensitive: false,
    aliases: ['bdl', 'bdl'],
    keywords: {
		keyword:  
		     '$self abbreviation abstract action Activate additional alias always ancestor and association '
			+'augment authorization base behavior by cardinality class cleanup context control corresponding '
			+'create data deep define delete dependent determination determinations determine disable disabling '
			+'Discard draft early Edit entity etag except extend extensible extension external factory features '
			+'field for foreign full function global group hierarchy implementation in instance interface internal '
			+'late lock managed mandatory mapping master mode modify none numbering on own parameter persistent '
			+'precheck Prepare privileged projection read readonly response result Resume save scalar selective '
			+'static staticfactorystatic strict sub suppress table total unique unmanaged update use validation '
			+'validations with without ',
	    literal: 'abap_true abap_false',
	    built_in: ''
		},
    contains: [
	  
		hljs.APOS_STRING_MODE,
    	hljs.NUMBER_MODE,
    	{
    		className: 'comment',
    		begin: '//',
    		relevance: 0,
    		end: '\n'
    	}
    ]
  }
}