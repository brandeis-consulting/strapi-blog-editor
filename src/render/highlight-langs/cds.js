/*
Language: CDS

*/

export default function(hljs) {

  return {
    case_insensitive: true,
    aliases: ['cds', 'CDS'],
    keywords: {
		keyword:  
		     'DEFINE VIEW AS DEFINE ENTITY entity PROJECTION ON TRANSIENT ROOT PROVIDER CONTRACT TRANSACTIONAL_QUERY '
				+'TRANSACTIONAL_INTERFACE ANALYTICAL_QUERY WITH PARAMETERS SELECT DISTINCT FROM INNER JOIN LEFT '
				+'RIGHT OUTER ASSOCIATION TO REDEFINE DEFAULT FILTER WHERE COMPOSITION OF PARENT KEY $EXTENSION '
				+'$PROJECTION GROUP BY HAVING EXCEPT INTERSECT UNION ALL VIRTUAL LOCALIZED REDIRECTED CHILD MAX '
				+'MIN AVG SUM COUNT CASE WHEN THEN ELSE NULL END CAST BETWEEN LIKE IS NOT AND OR ABS CEIL DIV '
				+'DIVISION FLOOR MOD ROUND CONCAT CONCAT_WITH_SPACE INSTR LENGTH LPAD LOWER LTRIM REPLACE RPAD '
				+'RTRIM SUBSTRING UPPER BINTOHEX HEXTOBIN COALESCE FLTP_TO_DEC UNIT_CONVERSION CURRENCY_CONVERSION '
				+'DECIMAL_SHIFT GET_NUMERIC_VALUE CURR_TO_DECFLOAT_AMOUNT DATS_IS_VALID DATS_DAYS_BETWEEN '
				+'DATS_ADD_DAYS DATS_ADD_MONTHS TIMS_IS_VALID TSTMP_IS_VALID TSTMP_CURRENT_UTCTIMESTAMP '
				+'TSTMP_SECONDS_BETWEEN TSTMP_ADD_SECONDS ABAP_SYSTEM_TIMEZONE ABAP_USER_TIMEZONE TSTMP_TO_DATS '
				+'TSTMP_TO_TIMS TSTMP_TO_DST DATS_TIMS_TO_TSTMP EXTEND CUSTOM ABSTRACT TABLE FUNCTION RETURNS '
				+'IMPLEMENTED METHOD HIERARCHY SOURCE PERIOD VALID DIRECTORY START SIBLINGS ORDER DEPTH NODETYPE '
				+'MULTIPLE PARENTS ORPHANS CYCLES GENERATE SPANTREE ANNOTATE VARIANT ',
	    literal: 'abap_true abap_false true false',
	    built_in: ''
		},
    contains: [
	  
		hljs.APOS_STRING_MODE,
    	hljs.NUMBER_MODE,
    	{
    		className: 'comment',
    		begin: '//',
    		relevance: 1,
    		end: '\n'
    	},
    	{
    		className: 'comment',
    		begin: '/\\*',
    		relevance: 1,
    		end: '\\*/'
    	},
    	{
    		className: 'annotation',
    		begin: '^(?: |\\t)*@[^:]+:(?:\\n)? *\\{',
    		relevance: 2,
    		end: '\\}[\\}\\] \\n]*'
    	},
    	{
    		className: 'annotation',
    		begin: '^(?: |\t)*@[^:]+:(?:\\n)? *\\[',
    		relevance: 2,
    		end: '\\][\\]\\} \\n]*'
    	},
    	{
    		className: 'annotation',
    		begin: '^(?: |\\t)*@[^:]+:',
    		relevance: 2,
    		end: '\n'
    	}
    ]
  }
}