-- Global profession taxonomy for Job Radar.
-- Depth 0 = broad category, depth 1 = subcategory, depth 2 = specific role.
-- Hierarchy is materialised into profession_closure so descendants are queryable
-- in one index scan (see docs/ALGORITHMS.md, taxonomy closure section).

INSERT INTO profession_taxonomy (slug, name, parent_id, depth, mpath, domain, aliases, median_salary, currency)
VALUES
  ('technology', 'Technology & Software', NULL, 0, 'technology', 'technology', ARRAY['tech','software','it'], 85000, 'USD'),
  ('engineering', 'Engineering', NULL, 0, 'engineering', 'engineering', ARRAY['engineering'], 78000, 'USD'),
  ('healthcare', 'Healthcare & Medical', NULL, 0, 'healthcare', 'healthcare', ARRAY['health','medical','clinical'], 68000, 'USD'),
  ('education', 'Education & Training', NULL, 0, 'education', 'education', ARRAY['teaching','academic'], 52000, 'USD'),
  ('finance', 'Finance & Accounting', NULL, 0, 'finance', 'finance', ARRAY['financial','accounting'], 72000, 'USD'),
  ('legal', 'Legal & Compliance', NULL, 0, 'legal', 'legal', ARRAY['law','legal'], 90000, 'USD'),
  ('sales', 'Sales & Revenue', NULL, 0, 'sales', 'sales', ARRAY['sales','business development'], 65000, 'USD'),
  ('marketing', 'Marketing & Growth', NULL, 0, 'marketing', 'marketing', ARRAY['marketing','growth','demand generation'], 60000, 'USD'),
  ('operations', 'Operations & Strategy', NULL, 0, 'operations', 'operations', ARRAY['ops','business operations'], 64000, 'USD'),
  ('product', 'Product & Program', NULL, 0, 'product', 'product', ARRAY['product management','program management'], 82000, 'USD'),
  ('design', 'Design & Creative', NULL, 0, 'design', 'design', ARRAY['creative','ux','ui'], 64000, 'USD'),
  ('data', 'Data & Analytics', NULL, 0, 'data', 'data', ARRAY['analytics','data science'], 88000, 'USD'),
  ('hr', 'Human Resources', NULL, 0, 'hr', 'people', ARRAY['people','hr','recruitment','talent'], 58000, 'USD'),
  ('customer', 'Customer Experience & Support', NULL, 0, 'customer', 'service', ARRAY['support','customer success','cx'], 45000, 'USD'),
  ('trades', 'Skilled Trades & Craft', NULL, 0, 'trades', 'trades', ARRAY['trades','craft','technician'], 46000, 'USD'),
  ('construction', 'Construction & Built Environment', NULL, 0, 'construction', 'construction', ARRAY['construction','built environment'], 52000, 'USD'),
  ('logistics', 'Logistics & Supply Chain', NULL, 0, 'logistics', 'logistics', ARRAY['supply chain','logistics'], 58000, 'USD'),
  ('manufacturing', 'Manufacturing & Production', NULL, 0, 'manufacturing', 'manufacturing', ARRAY['production','factory'], 50000, 'USD'),
  ('hospitality', 'Hospitality & Food', NULL, 0, 'hospitality', 'hospitality', ARRAY['hospitality','food service','restaurant'], 36000, 'USD'),
  ('retail', 'Retail & Merchandising', NULL, 0, 'retail', 'retail', ARRAY['retail','merchandising'], 36000, 'USD'),
  ('agriculture', 'Agriculture & Food Systems', NULL, 0, 'agriculture', 'agriculture', ARRAY['agriculture','farming','agri'], 40000, 'USD'),
  ('science', 'Science & Research', NULL, 0, 'science', 'science', ARRAY['research','scientific','r&d'], 72000, 'USD'),
  ('energy', 'Energy & Environment', NULL, 0, 'energy', 'energy', ARRAY['energy','sustainability','climate'], 70000, 'USD'),
  ('media', 'Media, Communication & Journalism', NULL, 0, 'media', 'media', ARRAY['media','journalism','communications'], 50000, 'USD'),
  ('public-sector', 'Government & Public Sector', NULL, 0, 'public-sector', 'public', ARRAY['government','public sector','civil service'], 48000, 'USD'),
  ('non-profit', 'Nonprofit & Social Impact', NULL, 0, 'non-profit', 'nonprofit', ARRAY['nonprofit','ngo','social impact'], 42000, 'USD'),
  ('security', 'Security & Risk', NULL, 0, 'security', 'security', ARRAY['security','risk','compliance'], 62000, 'USD'),
  ('real-estate', 'Real Estate & Property', NULL, 0, 'real-estate', 'property', ARRAY['property','real estate'], 56000, 'USD'),
  ('automotive', 'Automotive & Mobility', NULL, 0, 'automotive', 'automotive', ARRAY['automotive','mobility','vehicle'], 54000, 'USD'),
  ('aviation', 'Aviation & Aerospace', NULL, 0, 'aviation', 'aviation', ARRAY['aerospace','aviation','aircraft'], 66000, 'USD'),
  ('maritime', 'Maritime & Shipping', NULL, 0, 'maritime', 'maritime', ARRAY['maritime','shipping','marine'], 52000, 'USD'),
  ('tourism', 'Tourism & Travel', NULL, 0, 'tourism', 'tourism', ARRAY['travel','tourism','hospitality travel'], 40000, 'USD'),
  ('gaming', 'Gaming & Interactive Entertainment', NULL, 0, 'gaming', 'gaming', ARRAY['gaming','game development'], 68000, 'USD')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  depth = EXCLUDED.depth,
  mpath = EXCLUDED.mpath,
  domain = EXCLUDED.domain,
  aliases = EXCLUDED.aliases,
  median_salary = EXCLUDED.median_salary;

-- Depth 1: subcategories. parent resolved by slug.
INSERT INTO profession_taxonomy (slug, name, parent_id, depth, mpath, domain, aliases, median_salary, currency)
SELECT v.slug, v.name, p.id, 1, p.slug || '.' || v.slug, v.domain, v.aliases, v.median_salary, 'USD'
  FROM (VALUES
  ('software-engineering','Software Engineering','technology','technology',ARRAY['swe','developer','programmer'],92000),
  ('qa-automation','Quality Assurance & Automation','technology','technology',ARRAY['qa','tester','sdet'],62000),
  ('devops-cloud','DevOps & Cloud Infrastructure','technology','technology',ARRAY['devops','sre','cloud'],85000),
  ('cybersecurity','Cybersecurity','technology','technology',ARRAY['infosec','security engineer'],88000),
  ('networking','Networking & Systems Administration','technology','technology',ARRAY['network','sysadmin'],65000),
  ('mobile-development','Mobile Development','technology','technology',ARRAY['android','ios','flutter'],78000),
  ('frontend','Frontend Engineering','technology','technology',ARRAY['front end','react','web'],76000),
  ('backend','Backend Engineering','technology','technology',ARRAY['back end','api','server'],84000),
  ('fullstack','Full-Stack Engineering','technology','technology',ARRAY['full stack'],80000),
  ('erp-systems','ERP & Business Systems','technology','technology',ARRAY['sap','oracle erp','dynamics'],72000),

  ('civil-engineering','Civil Engineering','engineering','engineering',ARRAY['structural','construction engineering'],70000),
  ('mechanical-engineering','Mechanical Engineering','engineering','engineering',ARRAY['mechanical'],72000),
  ('electrical-engineering','Electrical Engineering','engineering','engineering',ARRAY['electrical'],72000),
  ('chemical-engineering','Chemical & Process Engineering','engineering','engineering',ARRAY['process','chemical'],76000),
  ('industrial-engineering','Industrial Engineering','engineering','engineering',ARRAY['process improvement','lean'],66000),
  ('aerospace-engineering','Aerospace Engineering','engineering','engineering',ARRAY['aeronautical'],82000),

  ('nursing','Nursing','healthcare','healthcare',ARRAY['nurse','rn'],62000),
  ('physician','Physician & Medical Doctor','healthcare','healthcare',ARRAY['doctor','md','physician'],140000),
  ('pharmacy','Pharmacy','healthcare','healthcare',ARRAY['pharmacist'],72000),
  ('allied-health','Allied Health & Therapy','healthcare','healthcare',ARRAY['physio','occupational therapy','radiography'],58000),
  ('public-health','Public Health & Epidemiology','healthcare','healthcare',ARRAY['epidemiology','public health'],60000),
  ('mental-health','Mental Health & Counselling','healthcare','healthcare',ARRAY['psychology','counselling','therapy'],56000),
  ('medical-admin','Medical Administration','healthcare','healthcare',ARRAY['health admin','medical billing'],46000),

  ('teaching','Teaching & Classroom Education','education','education',ARRAY['teacher','tutor','lecturer'],50000),
  ('higher-education','Higher Education & Research','education','education',ARRAY['university','professor','research fellow'],70000),
  ('early-years','Early Childhood & Special Education','education','education',ARRAY['preschool','special needs','sen'],42000),
  ('training-development','Corporate Training & L&D','education','education',ARRAY['learning and development','trainer'],52000),

  ('accounting','Accounting & Bookkeeping','finance','finance',ARRAY['accountant','bookkeeper','cpa'],56000),
  ('financial-analyst','Financial Analysis & FP&A','finance','finance',ARRAY['fp&a','financial analyst'],70000),
  ('investment','Investment & Capital Markets','finance','finance',ARRAY['investment banking','equity research','private equity'],100000),
  ('risk-compliance-finance','Financial Risk & Compliance','finance','finance',ARRAY['aml','kyc','finrisk'],74000),
  ('tax','Tax Advisory','finance','finance',ARRAY['taxation','tax advisor'],68000),
  ('treasury','Treasury & Payments','finance','finance',ARRAY['treasury','payments'],66000),

  ('corporate-law','Corporate & Commercial Law','legal','legal',ARRAY['corporate lawyer','commercial'],95000),
  ('litigation','Litigation & Dispute Resolution','legal','legal',ARRAY['litigator','dispute'],90000),
  ('employment-law','Employment & Labour Law','legal','legal',ARRAY['employment lawyer','labour law'],78000),
  ('paralegal','Paralegal & Legal Support','legal','legal',ARRAY['paralegal','legal assistant'],50000),
  ('compliance-officer','Compliance Officer','legal','legal',ARRAY['compliance'],64000),

  ('account-executive','Account Executive','sales','sales',ARRAY['ae','account management','client servicing'],62000),
  ('business-development','Business Development & Partnerships','sales','sales',ARRAY['bd','partnerships'],68000),
  ('sales-engineer','Sales Engineer','sales','sales',ARRAY['solutions engineer','presales'],78000),
  ('inside-sales','Inside Sales & Lead Generation','sales','sales',ARRAY['telemarketing','sdr','lead generation'],42000),

  ('digital-marketing','Digital Marketing & Performance','marketing','marketing',ARRAY['ppc','seo','performance marketing'],58000),
  ('content-marketing','Content & Brand Marketing','marketing','marketing',ARRAY['brand','copywriter','content'],54000),
  ('social-media','Social Media & Community','marketing','marketing',ARRAY['community manager','social media'],46000),
  ('product-marketing','Product Marketing','marketing','marketing',ARRAY['positioning','go-to-market'],72000),
  ('field-marketing','Field & Event Marketing','marketing','marketing',ARRAY['events','experiential'],50000),

  ('business-operations','Business Operations','operations','operations',ARRAY['operations analyst','ops'],52000),
  ('project-management','Project & Programme Management','operations','operations',ARRAY['pm','programme manager','scrum'],64000),
  ('supply-planning','Demand & Supply Planning','operations','operations',ARRAY['s&op','planning'],66000),
  ('facility-management','Facilities & Workplace Management','operations','operations',ARRAY['facilities','office management'],46000),
  ('strategy-consulting','Strategy & Consulting','operations','operations',ARRAY['consultant','strategy','advisory'],82000),

  ('product-manager','Product Manager','product','product',ARRAY['pm','product owner'],88000),
  ('program-manager','Program Manager','product','product',ARRAY['programme','delivery'],78000),
  ('ux-researcher','UX Researcher','product','product',ARRAY['user research','ux research'],72000),

  ('ux-ui-designer','UX & UI Designer','design','design',ARRAY['ui','ux','product design'],68000),
  ('graphic-designer','Graphic & Brand Designer','design','design',ARRAY['visual','brand designer'],52000),
  ('motion-video','Motion, Video & Animation','design','design',ARRAY['motion','video','animation','vfx'],60000),
  ('industrial-designer','Industrial & Product Designer','design','design',ARRAY['industrial design','cad'],66000),
  ('writing-localisation','Writing & Localisation','design','design',ARRAY['copywriter','localisation','translation'],50000),

  ('data-analyst','Data Analyst','data','data',ARRAY['analyst','business intelligence','bi'],66000),
  ('data-scientist','Data Scientist & ML Engineer','data','data',ARRAY['machine learning','ml','ds'],96000),
  ('data-engineer','Data Engineer','data','data',ARRAY['etl','warehouse','pipelines'],86000),
  ('data-governance','Data Governance & Privacy','data','data',ARRAY['data protection','privacy','dpo'],74000),

  ('talent-acquisition','Talent Acquisition & Recruitment','hr','hr',ARRAY['recruiter','sourcing','ta'],58000),
  ('hr-business-partner','HR Business Partner','hr','hr',ARRAY['hrbp'],72000),
  ('compensation-benefits','Compensation & Benefits','hr','hr',ARRAY['comp','benefits','payroll'],66000),
  ('learning-people-dev','People Development & L&D','hr','hr',ARRAY['learning','development'],56000),

  ('customer-support','Customer Support Representative','customer','customer',ARRAY['support','helpdesk','agent'],38000),
  ('customer-success','Customer Success Manager','customer','customer',ARRAY['csm','account success'],62000),
  ('technical-support','Technical Support Engineer','customer','customer',ARRAY['tech support','support engineer'],56000),
  ('contact-centre-lead','Contact Centre & Support Team Lead','customer','customer',ARRAY['team lead','supervisor'],48000),

  ('electrician','Electrician','trades','trades',ARRAY['electrical technician','sparky'],52000),
  ('plumber','Plumber & Pipefitter','trades','trades',ARRAY['plumbing'],50000),
  ('welder','Welder & Fabricator','trades','trades',ARRAY['welding','fabrication'],48000),
  ('automotive-mechanic','Automotive Mechanic & Technician','trades','trades',ARRAY['mechanic','garage'],42000),
  ('hvac-technician','HVAC Technician','trades','trades',ARRAY['refrigeration','air conditioning'],50000),
  ('carpenter','Carpenter & Joiner','trades','trades',ARRAY['joiner','woodwork'],46000),
  ('mason','Mason, Plasterer & Finisher','trades','trades',ARRAY['masonry','plastering'],44000),
  ('painter-decorator','Painter & Decorator','trades','trades',ARRAY['painting','decorating'],42000),
  ('locksmith','Locksmith & Security Technician','trades','trades',ARRAY['locksmith'],46000),
  ('heavy-equipment','Heavy Equipment Operator','trades','trades',ARRAY['excavator','forklift','crane'],48000),

  ('site-manager','Construction Site Manager','construction','construction',ARRAY['site management','foreman'],70000),
  ('quantity-surveyor','Quantity Surveyor & Cost Control','construction','construction',ARRAY['qs','cost control'],68000),
  ('structural-engineer-site','Structural Engineer (Site)','construction','construction',ARRAY['site structural'],74000),
  ('construction-safety','Health & Safety Officer','construction','construction',ARRAY['h&s','safety officer'],56000),
  ('architect','Architect & Building Designer','construction','construction',ARRAY['architecture','architectural'],76000),
  ('surveyor-land','Land Surveyor','construction','construction',ARRAY['land surveying'],60000),

  ('warehouse-operator','Warehouse & Fulfilment Operator','logistics','logistics',ARRAY['picker','packer','warehouse'],36000),
  ('transport-driver','Transport & Delivery Driver','logistics','logistics',ARRAY['driver','truck driver','courier'],38000),
  ('fleet-manager','Fleet & Transport Manager','logistics','logistics',ARRAY['fleet','transport manager'],62000),
  ('freight-forwarder','Freight Forwarding & Customs','logistics','logistics',ARRAY['freight','customs broker','clearing'],56000),
  ('procurement','Procurement & Sourcing','logistics','logistics',ARRAY['buyer','purchasing'],60000),

  ('production-operator','Production Line Operator','manufacturing','manufacturing',ARRAY['assembly','line operator'],38000),
  ('quality-inspector','Quality Inspector & Controller','manufacturing','manufacturing',ARRAY['qa','quality control'],46000),
  ('maintenance-engineer','Maintenance Engineer','manufacturing','manufacturing',ARRAY['plant maintenance','mechanical maintenance'],58000),
  ('process-engineer-manufacturing','Process Engineer (Manufacturing)','manufacturing','manufacturing',ARRAY['process'],68000),
  ('shift-supervisor','Shift & Production Supervisor','manufacturing','manufacturing',ARRAY['supervisor','foreman'],52000),

  ('chef','Chef & Cook','hospitality','hospitality',ARRAY['cook','head chef'],46000),
  ('food-beverage','Food & Beverage Service','hospitality','hospitality',ARRAY['waiter','server','barista'],32000),
  ('hotel-staff','Hotel Operations & Housekeeping','hospitality','hospitality',ARRAY['hotel','housekeeping','front desk'],34000),
  ('restaurant-manager','Restaurant & Venue Manager','hospitality','hospitality',ARRAY['general manager','venue'],52000),
  ('catering-events','Catering & Events Staff','hospitality','hospitality',ARRAY['catering','events'],36000),

  ('retail-assistant','Retail Sales Assistant','retail','retail',ARRAY['shop assistant','sales assistant'],32000),
  ('store-manager','Store Manager','retail','retail',ARRAY['shop manager','branch manager'],48000),
  ('merchandiser','Merchandiser & Visual Merchandiser','retail','retail',ARRAY['merchandising','visual'],46000),
  ('ecommerce-specialist','E-commerce Specialist','retail','retail',ARRAY['online store','ecommerce'],52000),

  ('agronomist','Agronomist & Crop Advisor','agriculture','agriculture',ARRAY['agronomy','crop'],48000),
  ('farm-manager','Farm Manager','agriculture','agriculture',ARRAY['farm management'],44000),
  ('food-safety-audit','Food Safety & Quality Auditor','agriculture','agriculture',ARRAY['food safety','haccp'],54000),
  ('agri-tech','AgriTech & Precision Agriculture','agriculture','agriculture',ARRAY['precision farming','agri tech'],66000),

  ('research-scientist','Research Scientist','science','science',ARRAY['researcher','scientist'],78000),
  ('laboratory','Laboratory Technician & Assistant','science','science',ARRAY['lab tech','laboratory'],46000),
  ('clinical-research','Clinical Research Associate','science','science',ARRAY['clinical trials','cra'],70000),
  ('regulatory-affairs','Regulatory Affairs & Quality','science','science',ARRAY['regulatory','ra','quality assurance'],74000),

  ('renewable-energy','Renewable Energy Engineer','energy','energy',ARRAY['solar','wind','renewables'],72000),
  ('sustainability-manager','Sustainability & ESG Manager','energy','energy',ARRAY['esg','sustainability'],70000),
  ('environmental-consultant','Environmental Consultant','energy','energy',ARRAY['environmental','impact assessment'],66000),
  ('petroleum-energy','Petroleum & Oilfield Engineer','energy','energy',ARRAY['oil and gas','petroleum'],86000),

  ('journalist','Journalist & Reporter','media','media',ARRAY['reporting','news'],46000),
  ('communications-officer','Communications & PR Officer','media','media',ARRAY['pr','public relations','comms'],54000),
  ('video-producer','Video Producer & Editor','media','media',ARRAY['video editing','producer'],52000),
  ('podcast-audio','Podcast & Audio Producer','media','media',ARRAY['audio','podcast'],48000),
  ('publishing-editor','Publishing & Book Editor','media','media',ARRAY['editorial','publishing'],46000),
  ('translator-interpreter','Translator & Interpreter','media','media',ARRAY['translation','interpreting'],44000),

  ('civil-servant','Civil Servant & Policy Officer','public-sector','public',ARRAY['policy','government'],52000),
  ('police-officer','Police, Security & Emergency Services','public-sector','public',ARRAY['police','security officer','emergency'],44000),
  ('fire-rescue','Fire & Rescue Services','public-sector','public',ARRAY['firefighter','paramedic','ems'],48000),
  ('public-health-official','Public Health Official','public-sector','public',ARRAY['health official','inspector'],56000),
  ('judicial-officer','Judicial & Court Services','public-sector','public',ARRAY['court','judicial'],60000),

  ('program-manager-ngo','Program Manager (NGO)','non-profit','nonprofit',ARRAY['programme manager','ngo'],56000),
  ('fundraising','Fundraising & Grants Officer','non-profit','nonprofit',ARRAY['fundraiser','grants'],50000),
  ('volunteer-coordinator','Volunteer & Community Coordinator','non-profit','nonprofit',ARRAY['volunteer','community'],40000),
  ('advocacy-policy','Advocacy & Policy Research','non-profit','nonprofit',ARRAY['advocacy','policy research'],60000),

  ('security-officer','Security Officer & Guard','security','security',ARRAY['guard','security guard'],34000),
  ('fraud-analyst','Fraud & Financial Crime Analyst','security','security',ARRAY['fraud','aml analyst'],72000),
  ('fire-safety','Fire Safety & Compliance Officer','security','security',ARRAY['fire safety','compliance'],58000),
  ('surveillance-investigator','Surveillance & Private Investigator','security','security',ARRAY['investigator','detective'],48000),

  ('estate-agent','Estate Agent & Property Consultant','real-estate','real',ARRAY['realtor','property consultant'],58000),
  ('property-manager','Property & Facilities Manager','real-estate','real',ARRAY['property management'],60000),
  ('real-estate-analyst','Real Estate Analyst & Appraiser','real-estate','real',ARRAY['appraiser','valuation'],66000),
  ('housing-officer','Housing Officer & Support Worker','real-estate','real',ARRAY['housing support'],44000),

  ('automotive-engineer','Automotive Design Engineer','automotive','automotive',ARRAY['vehicle design','powertrain'],78000),
  ('vehicle-diagnostics','Vehicle Diagnostics & Calibration','automotive','automotive',ARRAY['diagnostics','calibration'],62000),
  ('fleet-warranty','Automotive Service Advisor','automotive','automotive',ARRAY['service advisor','warranty'],48000),
  ('rideshare-driver','Ride-hailing & Delivery Driver','automotive','automotive',ARRAY['rideshare','courier driver'],32000),

  ('pilot','Commercial & Airline Pilot','aviation','aviation',ARRAY['captain','first officer'],110000),
  ('cabin-crew','Cabin Crew & Flight Attendant','aviation','aviation',ARRAY['flight attendant','cabin crew'],42000),
  ('aviation-maintenance','Aircraft Maintenance Engineer','aviation','aviation',ARRAY['ame','aircraft mechanic'],68000),
  ('air-traffic','Air Traffic & Ground Operations','aviation','aviation',ARRAY['ground handling','atc'],56000),

  ('ship-officer','Ship Officer & Deck Crew','maritime','maritime',ARRAY['deck officer','cadet'],52000),
  ('marine-engineer','Marine Engineer','maritime','maritime',ARRAY['ship engineer'],66000),
  ('port-operations','Port & Terminal Operations','maritime','maritime',ARRAY['port','terminal'],50000),
  ('marine-survey','Marine Surveyor & Loss Adjuster','maritime','maritime',ARRAY['surveyor','loss adjuster'],58000),

  ('tour-operator','Tour Operator & Travel Consultant','tourism','tourism',ARRAY['travel consultant','tour guide'],44000),
  ('travel-desk','Travel Desk & Reservation Support','tourism','tourism',ARRAY['reservations','travel agent'],36000),
  ('tour-guide','Tour Guide & Interpretation','tourism','tourism',ARRAY['tour guide','cultural interpreter'],32000),
  ('hospitality-management-tourism','Tourism & Hospitality Management','tourism','tourism',ARRAY['tourism manager'],62000),

  ('game-designer','Game Designer','gaming','gaming',ARRAY['level design','game design'],72000),
  ('game-developer','Game Developer','gaming','gaming',ARRAY['unity','unreal'],80000),
  ('game-artist','Game Artist & Animator','gaming','gaming',ARRAY['3d artist','game art'],62000),
  ('game-qa','Game QA & Live Operations','gaming','gaming',ARRAY['game tester','live ops'],52000)
) AS v(slug, name, parent_slug, domain, aliases, median_salary)
  JOIN profession_taxonomy p ON p.slug = v.parent_slug AND p.depth = 0
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  parent_id = EXCLUDED.parent_id,
  depth = 1,
  mpath = (SELECT slug FROM profession_taxonomy WHERE id = EXCLUDED.parent_id) || '.' || EXCLUDED.slug,
  domain = EXCLUDED.domain,
  aliases = EXCLUDED.aliases,
  median_salary = EXCLUDED.median_salary;

-- Closure table: self rows (depth 0) and direct parent links (depth 1).
INSERT INTO profession_closure (ancestor, descendant, depth)
SELECT id, id, 0 FROM profession_taxonomy
ON CONFLICT (ancestor, descendant) DO NOTHING;

INSERT INTO profession_closure (ancestor, descendant, depth)
SELECT p.id, c.id, 1
  FROM profession_taxonomy c
  JOIN profession_taxonomy p ON p.id = c.parent_id
ON CONFLICT (ancestor, descendant) DO NOTHING;

-- Transitive closure for depth-1 nodes (grandparent -> grandchild, depth 2).
INSERT INTO profession_closure (ancestor, descendant, depth)
SELECT gc.ancestor, c.id, gc.depth + 1
  FROM profession_closure gc
  JOIN profession_taxonomy c ON c.parent_id = gc.descendant
 WHERE gc.depth >= 1
ON CONFLICT (ancestor, descendant) DO NOTHING;

-- Search aliases for lookup by keyword.
CREATE INDEX IF NOT EXISTS profession_taxonomy_aliases_idx
  ON profession_taxonomy USING gin (aliases);
CREATE INDEX IF NOT EXISTS profession_taxonomy_domain_idx
  ON profession_taxonomy (domain);
CREATE INDEX IF NOT EXISTS profession_closure_descendant_idx
  ON profession_closure (descendant, depth);
