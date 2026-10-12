// 训练里程碑定义与计算
const MILESTONES = {
  7: '七日之约，习惯始成',
  14: '半月之功，渐入佳境',
  21: '三周成习，身体自明',
  30: '满月相庆，焕然一新',
  50: '五十而励，稳若磐石',
  100: '百日筑基，闻鼓而动',
};
const MILESTONE_DAYS = [7, 14, 21, 30, 50, 100];
// 超过 100 天后，每满整百（200/300/400…）构成循环里程碑，无上限
function getMilestoneInfo(totalDays) {
  const days = Math.max(0, Number(totalDays) || 0);
  let milestoneText = MILESTONES[days] || '';
  if (!milestoneText && days > 100 && days % 100 === 0) {
    milestoneText = '第 ' + days + ' 天，闻鼓而动';
  }
  const isMilestone = Boolean(milestoneText);
  let nextMilestone = null;
  if (days < 100) {
    for (let i = 0; i < MILESTONE_DAYS.length; i++) {
      if (MILESTONE_DAYS[i] > days) { nextMilestone = MILESTONE_DAYS[i]; break; }
    }
  } else {
    nextMilestone = (Math.floor(days / 100) + 1) * 100;
  }
  const daysToNext = nextMilestone !== null ? (nextMilestone - days) : 0;
  const nextMilestoneText = nextMilestone !== null ? ('距离第 ' + nextMilestone + ' 天里程碑还差 ' + daysToNext + ' 天') : '';
  return { totalDays: days, isMilestone, milestoneText, nextMilestone, daysToNext, nextMilestoneText };
}
