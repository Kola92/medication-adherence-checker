import { pool } from '../src/db';

interface CuratedInteraction {
  drugA: string;
  drugB: string;
  severity: 'minor' | 'moderate' | 'severe';
  description: string;
  sourceCitation: string;
}

const CURATED_INTERACTIONS: CuratedInteraction[] = [
  {
    drugA: 'warfarin',
    drugB: 'ibuprofen',
    severity: 'severe',
    description: 'Concurrent use significantly increases risk of serious GI bleeding. NSAIDs impair platelet function and can irritate the GI mucosa, compounding warfarin\'s anticoagulant effect.',
    sourceCitation: 'FDA warfarin label, Drug Interactions section (see medications.interaction_notes for warfarin)'
  },
  {
    drugA: 'warfarin',
    drugB: 'aspirin',
    severity: 'severe',
    description: 'Aspirin\'s antiplatelet effect combined with warfarin\'s anticoagulant effect substantially increases bleeding risk, particularly GI bleeding. Generally avoided unless specifically directed by a physician for cardiac indications.',
    sourceCitation: 'FDA warfarin label, Drug Interactions section'
  },
  {
    drugA: 'warfarin',
    drugB: 'diclofenac',
    severity: 'severe',
    description: 'Same mechanism as other NSAIDs — impaired platelet function and GI mucosal irritation combine with warfarin\'s anticoagulant effect to significantly raise bleeding risk.',
    sourceCitation: 'FDA warfarin label, Drug Interactions section'
  },
  {
    drugA: 'lithium',
    drugB: 'ibuprofen',
    severity: 'moderate',
    description: 'NSAIDs reduce renal clearance of lithium, which can raise lithium blood levels into the toxic range. Lithium has a narrow therapeutic window, making this interaction clinically significant even at standard NSAID doses.',
    sourceCitation: 'FDA lithium label, Drug Interactions section'
  },
  {
    drugA: 'simvastatin',
    drugB: 'amlodipine',
    severity: 'moderate',
    description: 'Amlodipine increases systemic exposure to simvastatin via CYP3A4 interaction. FDA recommends limiting simvastatin dose to 20mg daily in patients also taking amlodipine, due to increased myopathy/rhabdomyolysis risk.',
    sourceCitation: 'FDA amlodipine label, Section 7.2 (confirmed directly in medications.interaction_notes for amlodipine)'
  },
  {
    drugA: 'simvastatin',
    drugB: 'verapamil',
    severity: 'moderate',
    description: 'Verapamil is a CYP3A4 inhibitor and increases simvastatin plasma concentration, raising risk of statin-associated myopathy and rhabdomyolysis.',
    sourceCitation: 'FDA simvastatin label, Drug Interactions section'
  },
  {
    drugA: 'metformin',
    drugB: 'furosemide',
    severity: 'moderate',
    description: 'Furosemide can affect renal function and fluid/electrolyte balance, which are relevant to monitoring for metformin-associated lactic acidosis risk, particularly in patients with borderline renal function.',
    sourceCitation: 'FDA metformin label, Drug Interactions section'
  },
  {
    drugA: 'sertraline',
    drugB: 'tramadol',
    severity: 'severe',
    description: 'Both drugs increase serotonin activity. Combined use carries meaningful risk of serotonin syndrome, a potentially life-threatening condition. Caution and close monitoring advised if co-prescribed.',
    sourceCitation: 'FDA tramadol label, Drug Interactions / Serotonin Syndrome warning'
  },
  {
    drugA: 'fluoxetine',
    drugB: 'tramadol',
    severity: 'severe',
    description: 'Same serotonergic mechanism as sertraline+tramadol. Fluoxetine\'s long half-life extends the interaction risk window even after fluoxetine is discontinued.',
    sourceCitation: 'FDA tramadol label, Drug Interactions / Serotonin Syndrome warning'
  },
  {
    drugA: 'phenytoin',
    drugB: 'warfarin',
    severity: 'moderate',
    description: 'Bidirectional interaction: phenytoin can alter warfarin metabolism (effect varies, both increased and decreased anticoagulation reported), and warfarin can increase phenytoin levels. Requires close INR and phenytoin level monitoring.',
    sourceCitation: 'FDA warfarin label, Drug Interactions section'
  },
  {
    drugA: 'rifampin',
    drugB: 'warfarin',
    severity: 'severe',
    description: 'Rifampin is a potent CYP450 enzyme inducer and significantly reduces warfarin\'s anticoagulant effect, often requiring substantial warfarin dose increases. Risk of therapeutic failure (clotting) if not carefully managed.',
    sourceCitation: 'FDA rifampin label, Drug Interactions section (confirmed in medications.interaction_notes for rifampin)'
  },
  {
    drugA: 'rifampin',
    drugB: 'dolutegravir',
    severity: 'moderate',
    description: 'Rifampin\'s enzyme induction reduces dolutegravir plasma concentration, potentially compromising HIV virologic control. Clinically significant for patients co-managing TB and HIV, where dolutegravir dose adjustment or alternate regimens may be needed.',
    sourceCitation: 'FDA dolutegravir label, Drug Interactions section (confirmed in medications.interaction_notes for dolutegravir)'
  },
  {
    drugA: 'isoniazid',
    drugB: 'acetaminophen',
    severity: 'moderate',
    description: 'Both drugs carry hepatotoxicity risk individually; concurrent use raises concern for additive liver injury risk, particularly with chronic or high-dose acetaminophen use.',
    sourceCitation: 'FDA isoniazid label, Warnings and Precautions section (confirmed in medications.interaction_notes for isoniazid)'
  },
  {
    drugA: 'digoxin',
    drugB: 'furosemide',
    severity: 'moderate',
    description: 'Furosemide-induced hypokalemia increases myocardial sensitivity to digoxin, raising risk of digoxin toxicity (arrhythmias) even at previously stable digoxin doses. Potassium monitoring recommended.',
    sourceCitation: 'FDA digoxin label, Drug Interactions section (confirmed in medications.interaction_notes for digoxin)'
  },
  {
    drugA: 'aspirin',
    drugB: 'methotrexate',
    severity: 'severe',
    description: 'Aspirin (and other NSAIDs/salicylates) reduce renal clearance of methotrexate, increasing risk of methotrexate toxicity — particularly significant at higher methotrexate doses used for conditions like rheumatoid arthritis.',
    sourceCitation: 'FDA methotrexate label, Drug Interactions section (confirmed in medications.interaction_notes for methotrexate)'
  },
  {
    drugA: 'ciprofloxacin',
    drugB: 'warfarin',
    severity: 'moderate',
    description: 'Ciprofloxacin inhibits warfarin metabolism, increasing anticoagulant effect and bleeding risk. INR monitoring recommended when co-prescribed, even for short antibiotic courses.',
    sourceCitation: 'FDA ciprofloxacin label, Drug Interactions section (confirmed in medications.interaction_notes for ciprofloxacin)'
  },
  {
    drugA: 'amitriptyline',
    drugB: 'tramadol',
    severity: 'moderate',
    description: 'Amitriptyline has serotonergic activity; combined with tramadol\'s serotonergic effects, raises risk of serotonin syndrome. Also both lower seizure threshold, an additional compounding concern.',
    sourceCitation: 'FDA tramadol label, Drug Interactions / Serotonin Syndrome warning'
  },
  {
    drugA: 'spironolactone',
    drugB: 'lisinopril',
    severity: 'moderate',
    description: 'Both drugs independently raise serum potassium (spironolactone via potassium-sparing diuresis, lisinopril via reduced aldosterone effect from ACE inhibition). Combined use carries real hyperkalemia risk, common in heart failure/hypertension management where both are frequently co-prescribed — requires periodic potassium monitoring.',
    sourceCitation: 'FDA lisinopril label, Drug Interactions section'
  }
];

async function seedInteractions() {
  const medNameToId = new Map<string, string>();

  const result = await pool.query('SELECT id, name FROM medications');
  for (const row of result.rows) {
    medNameToId.set(row.name, row.id);
  }

  let inserted = 0;
  let skipped = 0;

  for (const pair of CURATED_INTERACTIONS) {
    const idA = medNameToId.get(pair.drugA);
    const idB = medNameToId.get(pair.drugB);

    if (!idA || !idB) {
      console.warn(`SKIP: could not resolve "${pair.drugA}" or "${pair.drugB}" to a medication id`);
      skipped++;
      continue;
    }

    await pool.query(
      `INSERT INTO interactions (medication_a_id, medication_b_id, severity, description, source_citation, is_curated)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [idA, idB, pair.severity, pair.description, pair.sourceCitation]
    );

    console.log(`OK: ${pair.drugA} + ${pair.drugB} (${pair.severity})`);
    inserted++;
  }

  console.log(`\nInserted: ${inserted}, Skipped: ${skipped}`);
  await pool.end();
}

seedInteractions().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
