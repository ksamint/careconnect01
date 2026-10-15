import { ITEMS, type Responses } from './instrument'

export function isComplete(v: Partial<Responses>): v is Responses {
  return ITEMS.every(i => v[i.id] !== undefined)
}

/** Human-readable message for a server error code. */
export function opErrorText(code: string, L: (zh: string, en: string) => string): string {
  const map: Record<string, [string, string]> = {
    wrong_password: ['密码不正确', 'Incorrect password'],
    reason_required: ['请填写原因', 'A reason is required'],
    no_changes: ['没有任何修改', 'Nothing was changed'],
    same_person: ['核对须由另一名护士完成', 'The check must be done by a different nurse'],
    already_submitted: ['该时点已有提交记录，请在原记录上修改', 'This visit already has a submission — edit it instead'],
    real_enrollment_disabled: ['真实入组尚未开启（需管理员在“研究设置”中开启）', 'Real enrolment is not enabled yet (admin: Study settings)'],
    preconditions_not_met: ['开启条件未满足', 'Preconditions not met'],
    cycle_has_data: ['该周期已有问卷数据，不能删除', 'This cycle has submissions and cannot be removed'],
    invalid_date: ['日期格式不正确', 'Invalid date'],
    invalid_cycles: ['周期信息不完整（周期号不能重复，输注日期必填）', 'Cycle data invalid (unique cycle no., infusion date required)'],
    invalid_completed_at: ['填写时间不能晚于现在', 'Completion time cannot be in the future'],
    withdrawn: ['该患者已退出研究', 'Participant has withdrawn'],
    forbidden: ['当前账号无此权限', 'Not permitted for this account'],
    network: ['网络连接失败，请稍后重试', 'Network error, please retry'],
  }
  const t = map[code]
  return t ? L(t[0], t[1]) : L(`操作失败（${code}）`, `Failed (${code})`)
}
