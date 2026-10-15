/** Coded answer options for the CRF. Exports always use the code; labels are for display. */

export interface Option {
  code: string
  zh: string
  en: string
}

const o = (code: string, zh: string, en: string): Option => ({ code, zh, en })

export const OPTIONS = {
  sex: [o('M', '男', 'Male'), o('F', '女', 'Female')],
  ethnicity: [o('han', '汉族', 'Han'), o('other', '其他民族', 'Other')],
  marital: [o('single', '未婚', 'Single'), o('married', '已婚', 'Married'), o('divorced', '离异', 'Divorced'), o('widowed', '丧偶', 'Widowed')],
  education: [
    o('primary', '小学及以下', 'Primary or below'), o('junior', '初中', 'Junior high'), o('senior', '高中/中专', 'Senior high / vocational'),
    o('college', '大专', 'College'), o('bachelor', '本科及以上', "Bachelor's or above"),
  ],
  occupation: [o('employed', '在职', 'Employed'), o('retired', '退休', 'Retired'), o('unemployed', '无业/待业', 'Unemployed'), o('farmer', '务农', 'Farmer'), o('other', '其他', 'Other')],
  income: [o('lt3k', '< 3000 元', '< ¥3,000'), o('3to5k', '3000–4999 元', '¥3,000–4,999'), o('5to10k', '5000–9999 元', '¥5,000–9,999'), o('ge10k', '≥ 10000 元', '≥ ¥10,000')],
  payment: [
    o('employee', '城镇职工医保', 'Urban employee insurance'), o('resident', '城乡居民医保', 'Urban-rural resident insurance'),
    o('commercial', '商业保险', 'Commercial insurance'), o('self', '自费', 'Self-pay'), o('other', '其他', 'Other'),
  ],
  tumorType: [
    o('breast', '乳腺癌', 'Breast'), o('lung', '肺癌', 'Lung'), o('colorectal', '结直肠癌', 'Colorectal'), o('gastric', '胃癌', 'Gastric'),
    o('ovarian', '卵巢癌', 'Ovarian'), o('lymphoma', '淋巴瘤', 'Lymphoma'), o('other', '其他', 'Other'),
  ],
  stage: [o('I', 'I 期', 'Stage I'), o('II', 'II 期', 'Stage II'), o('III', 'III 期', 'Stage III'), o('IV', 'IV 期', 'Stage IV'), o('unknown', '不详', 'Unknown')],
  yesNo: [o('yes', '是', 'Yes'), o('no', '否', 'No')],
  ecog: [o('0', '0', '0'), o('1', '1', '1'), o('2', '2', '2'), o('3', '3', '3'), o('4', '4', '4')],
  visitType: [o('outpatient', '门诊', 'Outpatient'), o('emergency', '急诊', 'Emergency'), o('readmission', '再入院', 'Readmission')],
} satisfies Record<string, Option[]>

export type OptionKey = keyof typeof OPTIONS

export function optionLabel(key: OptionKey, code: string, locale: 'zh' | 'en'): string {
  const opt = OPTIONS[key].find(x => x.code === code)
  return opt ? opt[locale] : code
}

export const EDIT_REASONS: Option[] = [
  o('transcription', '录入错误（与纸质表不一致）', 'Transcription error (differs from paper form)'),
  o('patient_correction', '患者当场更正', 'Patient corrected the answer'),
  o('verify_mismatch', '双人核对发现不一致', 'Double-entry check mismatch'),
  o('other', '其他（请说明）', 'Other (please explain)'),
]

export const MISSED_REASONS: Option[] = [
  o('no_response', '3 次提醒后仍未完成', 'No response after 3 reminders'),
  o('too_ill', '病情较重无法填写', 'Too unwell to complete'),
  o('refused', '患者拒绝本次填写', 'Patient declined this visit'),
  o('other', '其他（请说明）', 'Other (please explain)'),
]

export const CHECKLIST: { key: string; zh: string; en: string }[] = [
  { key: 'license', zh: '取得 MDASI 中文版使用授权，授权编号与日期写入“量表版本”', en: 'MDASI-C licence obtained; licence no. and date recorded in instrument version' },
  { key: 'itemText', zh: '19 条占位标签已替换为授权正式条目文字，语言设为 zh-CN，并完成全流程验收', en: '19 placeholder labels replaced with licensed wording, language zh-CN, end-to-end acceptance test done' },
  { key: 'ethics', zh: '伦理批件号、批准日期、同意书版本号已写入系统', en: 'Ethics approval no., date and consent version recorded' },
  { key: 'protocolV11', zh: '方案修订 V1.1 已备案（条目范围、统计方法、中心数、样本量）', en: 'Protocol amendment V1.1 filed (items, statistics, sites, sample size)' },
  { key: 'consentForm', zh: '同意书已补：数据存放与期限、是否公开脱敏数据、预警联系方式与响应时限', en: 'Consent form covers data storage/retention, data sharing, alert contact & response time' },
  { key: 'alertSop', zh: '预警响应 SOP 已制定（谁、多久、非工作时间），患者须知写明紧急情况直接就医', en: 'Alert response SOP in place; patients told to seek care directly in emergencies' },
  { key: 'notDiagnostic', zh: '患者界面与伦理材料已说明本平台不承担诊断功能', en: 'Patient UI and ethics papers state the platform is not diagnostic' },
  { key: 'linkSecurity', zh: '患者账号/链接安全约定（密码、有效期、泄露处置）已确认', en: 'Patient login security agreed (password, expiry, leak handling)' },
  { key: 'serverSecurity', zh: '服务器位置与等保要求已确认，导出文件加密存放规则已写入制度', en: 'Server location/security level confirmed; export file handling rules written' },
  { key: 'withdrawalRule', zh: '患者撤回后的数据处理规则已写入同意书', en: 'Data handling after withdrawal written into consent form' },
  { key: 'piSignoff', zh: '项目负责人与科研管理部门已书面确认开启真实入组', en: 'PI and research office signed off on real enrolment' },
]
