/**
 * workouts.js
 * 运动注册表 — 新增运动只需在此添加一条记录，选择器页面自动渲染。
 * 纯数据，不含任何逻辑。
 * schedule.start / schedule.end 为 "HH:MM" 字符串；
 * schedule.enabled 控制该运动是否参与自动匹配；
 * path 为指向该运动 index.html 的相对路径。
 */
const WORKOUTS = [
  {
    id: 'morning',
    name: '晨练',
    subtitle: '全程18分钟 · 抗阻8分钟',
    description: '早起温和训练，唤醒身体',
    path: './morning/',
    schedule: {
      enabled: true,
      start: '05:00',
      end: '11:00'
    }
  },
  {
    id: 'evening',
    name: '晚练',
    subtitle: '全程20分钟 · 抗阻8分钟',
    description: '饭后半小时锻炼',
    path: './evening/',
    schedule: {
      enabled: true,
      start: '17:00',
      end: '23:00'
    }
  }
];
