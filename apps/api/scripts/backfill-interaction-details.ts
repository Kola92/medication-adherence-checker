import { pool } from '../src/db';

interface DetailUpdate {
  drugA: string;
  drugB: string;
  mechanism: string;
  recommendation: string;
}

const DETAILS: DetailUpdate[] = [
  {
    drugA: 'warfarin', drugB: 'ibuprofen',
    mechanism: 'NSAIDs impair platelet aggregation and irritate the GI mucosa, compounding warfarin\'s anticoagulant effect on top of an already-thinned blood state.',
    recommendation: 'Avoid combination where possible. If both are medically necessary, use the lowest effective ibuprofen dose for the shortest duration, and increase INR monitoring frequency. Consult prescriber before combining.'
  },
  {
    drugA: 'warfarin', drugB: 'aspirin',
    mechanism: 'Aspirin\'s antiplatelet effect adds to warfarin\'s anticoagulant effect via a different mechanism, so the combined bleeding risk is greater than either drug alone.',
    recommendation: 'Do not combine without explicit physician direction. Sometimes intentionally co-prescribed for specific cardiac conditions under close monitoring — never a self-directed combination.'
  },
  {
    drugA: 'warfarin', drugB: 'diclofenac',
    mechanism: 'Same NSAID mechanism as ibuprofen — impaired platelet function plus GI mucosal irritation, compounding warfarin\'s effect.',
    recommendation: 'Avoid combination where possible. Discuss alternative pain management with a prescriber if on warfarin long-term.'
  },
  {
    drugA: 'lithium', drugB: 'ibuprofen',
    mechanism: 'NSAIDs reduce kidney clearance of lithium, allowing it to accumulate toward toxic blood levels — lithium has a narrow safe range, so even a modest clearance reduction matters.',
    recommendation: 'Avoid regular NSAID use while on lithium without prescriber guidance. Occasional use may require lithium level monitoring; consult prescriber before starting either drug if already on the other.'
  },
  {
    drugA: 'simvastatin', drugB: 'amlodipine',
    mechanism: 'Amlodipine inhibits the liver enzyme (CYP3A4) that breaks down simvastatin, raising simvastatin blood levels and the risk of muscle toxicity.',
    recommendation: 'FDA specifically recommends capping simvastatin at 20mg/day when co-prescribed with amlodipine. Report unexplained muscle pain or weakness to a prescriber immediately.'
  },
  {
    drugA: 'simvastatin', drugB: 'verapamil',
    mechanism: 'Verapamil inhibits the same CYP3A4 pathway as amlodipine, similarly raising simvastatin levels and myopathy risk.',
    recommendation: 'Discuss dose limits with prescriber; report unexplained muscle pain or weakness immediately.'
  },
  {
    drugA: 'metformin', drugB: 'furosemide',
    mechanism: 'Furosemide can affect kidney function and fluid balance, both of which factor into the (rare but serious) risk of metformin-associated lactic acidosis.',
    recommendation: 'Not a reason to avoid combination, but a reason for periodic kidney function monitoring — common in patients managing both diabetes and heart failure/hypertension.'
  },
  {
    drugA: 'sertraline', drugB: 'tramadol',
    mechanism: 'Both drugs increase serotonin activity in the nervous system through different pathways; combined, they can push serotonin levels high enough to cause serotonin syndrome — agitation, rapid heart rate, high fever, in severe cases life-threatening.',
    recommendation: 'Use only under direct prescriber supervision. Seek immediate medical attention for symptoms like agitation, rapid heartbeat, muscle twitching, fever, or confusion.'
  },
  {
    drugA: 'fluoxetine', drugB: 'tramadol',
    mechanism: 'Same serotonergic mechanism as sertraline+tramadol. Fluoxetine stays in the body far longer than most SSRIs, so the interaction risk persists even weeks after stopping fluoxetine.',
    recommendation: 'Use only under direct prescriber supervision, and mention recent fluoxetine use (even if stopped) to any prescriber considering tramadol.'
  },
  {
    drugA: 'phenytoin', drugB: 'warfarin',
    mechanism: 'The two drugs interfere with each other\'s metabolism in the liver — effects are variable and can go either direction (more or less anticoagulation), which makes this interaction unpredictable rather than uniformly dangerous.',
    recommendation: 'Requires close INR and phenytoin level monitoring whenever either drug\'s dose changes or either is started/stopped.'
  },
  {
    drugA: 'rifampin', drugB: 'warfarin',
    mechanism: 'Rifampin strongly activates liver enzymes that break down warfarin, sharply reducing its anticoagulant effect.',
    recommendation: 'Warfarin dose often needs significant upward adjustment during rifampin treatment, and downward adjustment again after stopping rifampin. Requires frequent INR checks throughout TB treatment.'
  },
  {
    drugA: 'rifampin', drugB: 'dolutegravir',
    mechanism: 'Rifampin\'s enzyme induction lowers dolutegravir blood levels, risking reduced effectiveness against HIV.',
    recommendation: 'Common real-world scenario for TB/HIV coinfection. Prescribers typically increase dolutegravir dosing frequency during rifampin treatment — never adjust doses without medical guidance.'
  },
  {
    drugA: 'isoniazid', drugB: 'acetaminophen',
    mechanism: 'Both drugs are processed by the liver and each independently carries some hepatotoxicity risk; combined use raises concern for additive liver stress, especially with higher acetaminophen doses.',
    recommendation: 'Occasional standard-dose acetaminophen is generally considered acceptable, but avoid regular/high-dose use without discussing with prescriber, and avoid alcohol on top of both.'
  },
  {
    drugA: 'digoxin', drugB: 'furosemide',
    mechanism: 'Furosemide can lower blood potassium, and low potassium makes the heart more sensitive to digoxin — raising risk of dangerous heart rhythm effects even at a digoxin dose that was previously stable.',
    recommendation: 'Requires periodic potassium level monitoring. Report symptoms like nausea, visual changes, or irregular heartbeat to a prescriber promptly.'
  },
  {
    drugA: 'aspirin', drugB: 'methotrexate',
    mechanism: 'Aspirin reduces kidney clearance of methotrexate, allowing it to build up toward toxic levels — particularly relevant at the higher methotrexate doses used for autoimmune conditions.',
    recommendation: 'Avoid combination, especially at higher methotrexate doses, without explicit prescriber guidance and monitoring.'
  },
  {
    drugA: 'ciprofloxacin', drugB: 'warfarin',
    mechanism: 'Ciprofloxacin slows the liver\'s breakdown of warfarin, increasing its blood-thinning effect.',
    recommendation: 'Increase INR monitoring during and shortly after any ciprofloxacin course, even if short-term for an infection.'
  },
  {
    drugA: 'amitriptyline', drugB: 'tramadol',
    mechanism: 'Amitriptyline has its own serotonergic activity, which combines with tramadol\'s effect to raise serotonin syndrome risk; both drugs also independently lower the seizure threshold.',
    recommendation: 'Use only under prescriber supervision. Report agitation, tremor, rapid heartbeat, or any seizure activity immediately.'
  },
  {
    drugA: 'spironolactone', drugB: 'lisinopril',
    mechanism: 'Spironolactone directly retains potassium, and lisinopril reduces the hormone (aldosterone) that normally helps the body excrete potassium — combined, both push blood potassium upward through different mechanisms.',
    recommendation: 'Very common combination in heart failure/hypertension care, generally safe under monitoring — but requires periodic blood potassium checks, especially after dose changes.'
  }
];

async function backfillDetails() {
  const medResult = await pool.query('SELECT id, name FROM medications');
  const nameToId = new Map<string, string>();
  for (const row of medResult.rows) {
    nameToId.set(row.name, row.id);
  }

  let updated = 0;
  let notFound = 0;

  for (const detail of DETAILS) {
    const idA = nameToId.get(detail.drugA);
    const idB = nameToId.get(detail.drugB);

    if (!idA || !idB) {
      console.warn(`SKIP: could not resolve "${detail.drugA}" or "${detail.drugB}"`);
      notFound++;
      continue;
    }

    const result = await pool.query(
      `UPDATE interactions
       SET mechanism = $1, recommendation = $2
       WHERE (medication_a_id = $3 AND medication_b_id = $4)
          OR (medication_a_id = $4 AND medication_b_id = $3)`,
      [detail.mechanism, detail.recommendation, idA, idB]
    );

    if (result.rowCount === 0) {
      console.warn(`SKIP: no matching interaction row for ${detail.drugA} + ${detail.drugB}`);
      notFound++;
    } else {
      console.log(`OK: ${detail.drugA} + ${detail.drugB}`);
      updated++;
    }
  }

  console.log(`\nUpdated: ${updated}, Not found: ${notFound}`);
  await pool.end();
}

backfillDetails().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
