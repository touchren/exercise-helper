/**
 * workout-data.js
 * 运动定义 + 步骤序列构建器。
 * 全局暴露：DEFAULT_EXERCISES、DEFAULT_SETTINGS、buildStepSequence、WORKOUT_META
 */

/** 7 个默认运动定义（数值取较高值）。name/tips 用于界面，intro 用于语音播报。 */
const DEFAULT_EXERCISES = [
  {
    id: 'cat-cow',
    name: '猫牛流动',
    type: 'warmup',
    cycles: 8,          // 循环次数
    cycleSec: 5,        // 每次循环秒数（总时长 = cycles * cycleSec）
    breathing: true,    // 每 5 秒交替播报「吸气/呼气」
    intro: '四点跪撑，双手在肩正下方、双膝在髋正下方。全程用鼻子拱背呼气，塌腰吸气，缓慢活动整条脊柱，幅度适中不猛甩。',
    tips: '全程用鼻子拱背呼气、塌腰吸气；缓慢活动整条脊柱，幅度适中不猛甩。'
  },
  {
    id: 'dead-bug',
    name: '死虫式',
    type: 'resistance',
    sets: 3,            // 组数
    repsPerSide: 10,    // 每侧次数
    repSec: 4,          // 单次动作秒数
    restSec: 30,        // 组间休息秒数
    sides: ['left', 'right'],
    countsAsResistance: false, // 放松日保留（强度低）
    intro: '全程仰卧，腰背完全贴紧地面，对侧手脚同步缓慢伸展收回，匀速不甩动。',
    tips: '全程仰卧，腰背完全贴紧地面；对侧手脚同步缓慢伸展、收回；腰椎不许拱起，动作匀速不甩动。'
  },
  {
    id: 'apanasana',
    name: '仰卧单膝抱胸',
    type: 'stretch',
    holdSec: 30,        // 单侧保持秒数
    sides: ['left', 'right'],
    intro: '双手轻抱单膝拉向胸口，对侧腿自然伸直贴地，温和牵拉下腰背，请勿暴力猛拉。',
    tips: '仰卧，双手轻抱单膝拉向胸口；对侧腿自然伸直贴地；温和牵拉下腰背，请勿暴力猛拉。'
  },
  {
    id: 'glute-bridge',
    name: '臀桥',
    type: 'resistance',
    sets: 3,
    reps: 12,
    repSec: 4,          // 上 2 秒、顶峰 1 秒、下 1 秒
    restSec: 30,
    sides: null,
    countsAsResistance: false, // 放松日保留（强度低）
    intro: '仰卧屈膝，脚跟踩地与肩同宽，收紧臀部向上顶髋至肩髋膝呈一条斜线，顶峰停留1秒，臀部发力，请勿用腰顶起。',
    tips: '仰卧屈膝，脚跟踩地与肩同宽；收紧臀部向上顶髋至肩-髋-膝呈一条斜线；顶峰停留1秒；臀部发力，请勿用腰顶起。'
  },
  {
    id: 'balasana',
    name: '婴儿式',
    type: 'stretch',
    holdSec: 30,
    sides: null,
    intro: '跪姿，双膝分开，臀部缓慢坐向脚跟，上身前趴，额头贴垫，放松腰背、髋部及大腿前侧。',
    tips: '跪姿，双膝分开，臀部缓慢坐向脚跟；上身前趴，额头贴垫；放松腰背、髋部及大腿前侧。'
  },
  {
    id: 'pushup',
    name: '俯卧撑',
    type: 'resistance',
    sets: 3,
    reps: 10,
    repSec: 4,
    restSec: 30,
    sides: null,
    intro: '手略宽于肩，手肘斜向后45度，身体从头到脚保持一条直线，下放吸气2秒，推起呼气，杜绝塌腰撅屁股。',
    tips: '手略宽于肩，手肘斜向后45°，身体从头到脚保持一条直线；下放吸气2秒，推起呼气；杜绝塌腰、撅屁股。'
  },
  {
    id: 'sphinx',
    name: '狮身人面式',
    type: 'stretch',
    holdSec: 60,
    sides: null,
    doneAnnounce: false, // 训练最后一个动作：结束直接播报训练完成
    intro: '俯卧，手肘落在肩膀正下方，前臂贴地，骨盆贴紧垫子，胸口向前上方打开，不刻意挤压腰椎。',
    tips: '俯卧，手肘落在肩膀正下方，前臂贴地；骨盆贴紧垫子，胸口向前上方打开；不刻意挤压腰椎。'
  }
];

/** 默认全局设置（不可变基准对象）。 */
const DEFAULT_SETTINGS = {
  rate: 1.0,           // 语音速度 0.8-1.2
  volume: 1.0,         // 语音音量 0-1
  beepBeforeEnd: 5,    // 阶段结束前蜂鸣秒数
  ambient: {
    enabled: true,     // 环境音开关
    type: 'beat',      // dawn | rain
    volume: 0.3        // 环境音音量 0-1
  },
  exercises: DEFAULT_EXERCISES
};

/** 应用元信息（界面与 PWA 共用）。 */
const WORKOUT_META = {
  title: '早起18分钟温和训练',
  totalSec: 18 * 60 // 约 18 分钟
};

/** 组间休息播报文案。 */
function restText(setNumber, restSec) {
  return `第${setNumber}组完成，休息${restSec}秒。`;
}

/** 抗阻动作开场播报文案。 */
function resistanceAnnounceText(ex, setNumber) {
  if (ex.id === 'dead-bug') {
    return `${ex.name}，第${setNumber}组，共${ex.sets}组，每侧${ex.repsPerSide}次。${ex.intro}先左侧。`;
  }
  return `${ex.name}，第${setNumber}组，共${ex.sets}组，${ex.reps}次。${ex.intro}`;
}

/** 抗阻单侧计数步骤。 */
function countRepsStep(ex, setNumber, side) {
  const sideName = side === 'left' ? '左侧' : side === 'right' ? '右侧' : null;
  const count = ex.id === 'dead-bug' ? ex.repsPerSide : ex.reps;
  return {
    type: 'count_reps',
    tts: null,
    duration: count * ex.repSec,
    cadence: ex.repSec,
    count,
    side,
    sideName,
    exerciseName: ex.name,
    exerciseId: ex.id,
    setNumber,
    totalSets: ex.sets,
    phaseType: 'resistance',
    countsTowardResistance: true,
    tips: ex.tips
  };
}

/** 组间休息步骤。 */
function restStep(ex, setNumber) {
  return {
    type: 'rest',
    tts: restText(setNumber, ex.restSec),
    duration: ex.restSec,
    exerciseName: ex.name,
    exerciseId: ex.id,
    setNumber,
    totalSets: ex.sets,
    phaseType: 'rest',
    countsTowardResistance: false
  };
}

/** 抗阻动作：3 组（或可配置组数），最后一组不休息，直接进入下一动作。 */
function buildResistanceSteps(ex) {
  const steps = [];
  for (let set = 1; set <= ex.sets; set++) {
    if (set === 1) {
      steps.push({
        type: 'announce',
        tts: resistanceAnnounceText(ex, set),
        exerciseName: ex.name,
        exerciseId: ex.id,
        setNumber: set,
        totalSets: ex.sets,
        phaseType: 'resistance',
        countsTowardResistance: false
      });
    }
    steps.push({ type: 'countdown', tokens: ['3', '2', '1', '开始'], duration: 4, exerciseName: ex.name, exerciseId: ex.id, setNumber: set, totalSets: ex.sets, phaseType: 'resistance' });

    if (ex.sides) {
      // 双侧动作：先左后右，中间播报换侧
      steps.push(countRepsStep(ex, set, 'left'));
      steps.push({
        type: 'transition',
        tts: '换另一侧。',
        pauseSec: 1.5,
        exerciseName: ex.name,
        exerciseId: ex.id,
        setNumber: set,
        totalSets: ex.sets,
        side: 'right',
        phaseType: 'resistance',
        countsTowardResistance: true
      });
      steps.push(countRepsStep(ex, set, 'right'));
    } else {
      steps.push(countRepsStep(ex, set, null));
    }

    if (set < ex.sets) {
      steps.push(restStep(ex, set));
    }
  }
  return steps;
}

/** 拉伸动作：30 秒保持（或双侧各 30 秒）。 */
function buildStretchSteps(ex) {
  const steps = [];
  steps.push({
    type: 'announce',
    tts: ex.sides
      ? `${ex.name}，每侧保持${ex.holdSec}秒。${ex.intro}先左侧。`
      : `${ex.name}，保持${ex.holdSec}秒。${ex.intro}`,
    exerciseName: ex.name,
    exerciseId: ex.id,
    setNumber: null,
    totalSets: null,
    phaseType: 'stretch',
    countsTowardResistance: false
  });
  steps.push({ type: 'countdown', tokens: ['3', '2', '1', '开始'], duration: 4, exerciseName: ex.name, exerciseId: ex.id, phaseType: 'stretch' });

  if (ex.sides) {
    steps.push(holdStep(ex, 'left', 0));
    steps.push({
      type: 'transition',
      tts: '换另一侧。',
      pauseSec: 1.5,
      exerciseName: ex.name,
      exerciseId: ex.id,
      setNumber: null,
      totalSets: null,
      side: 'right',
      phaseType: 'stretch',
      countsTowardResistance: false
    });
    steps.push(holdStep(ex, 'right', 1));
  } else {
    steps.push(holdStep(ex, null, 0));
  }

  if (ex.doneAnnounce !== false) {
    steps.push({
      type: 'announce',
      tts: `${ex.name}完成。`,
      exerciseName: ex.name,
      exerciseId: ex.id,
      setNumber: null,
      totalSets: null,
      phaseType: 'stretch',
      countsTowardResistance: false
    });
  }
  return steps;
}

/** 拉伸保持步骤。 */
function holdStep(ex, side, sideIndex) {
  return {
    type: 'hold',
    tts: null,
    duration: ex.holdSec,
    side,
    sideName: side === 'left' ? '左侧' : side === 'right' ? '右侧' : null,
    exerciseName: ex.name,
    exerciseId: ex.id,
    setNumber: null,
    totalSets: null,
    phaseType: 'stretch',
    countsTowardResistance: false,
    tips: ex.tips
  };
}

/** 热身（猫牛流动）步骤。 */
function buildWarmupSteps(ex) {
  const totalSec = ex.cycles * ex.cycleSec;
  const steps = [];
  steps.push({
    type: 'announce',
    tts: `开始训练。第一个动作，${ex.name}，${ex.cycles}次循环。${ex.intro}`,
    exerciseName: ex.name,
    exerciseId: ex.id,
    setNumber: null,
    totalSets: null,
    phaseType: 'warmup',
    countsTowardResistance: false
  });
  steps.push({ type: 'countdown', tokens: ['准备', '3', '2', '1', '开始'], duration: 5, exerciseName: ex.name, exerciseId: ex.id, phaseType: 'warmup' });
  steps.push({
    type: 'hold',
    tts: null,
    duration: totalSec,
    breathing: true,
    exerciseName: ex.name,
    exerciseId: ex.id,
    setNumber: null,
    totalSets: null,
    phaseType: 'warmup',
    countsTowardResistance: false,
    tips: ex.tips
  });
  steps.push({
    type: 'announce',
    tts: `${ex.name}完成。`,
    exerciseName: ex.name,
    exerciseId: ex.id,
    setNumber: null,
    totalSets: null,
    phaseType: 'warmup',
    countsTowardResistance: false
  });
  return steps;
}

/**
 * 构建完整的平铺步骤序列。
 * @param {Array} exercises 运动配置数组（顺序即执行顺序）
 * @param {Object} settings 全局设置（此处仅传递，蜂鸣秒数由引擎读取）
 * @returns {Array} 平铺步骤数组
 */
function buildStepSequence(exercises, settings) {
  const mode = (settings && settings.mode) || 'full';
  const list = (exercises || DEFAULT_EXERCISES).filter((ex) => {
    // 放松日跳过抗阻动作（countsAsResistance 非 false 的才跳过，靠墙天使保留）
    if (mode === 'stretch' && ex.type === 'resistance' && ex.countsAsResistance !== false) {
      return false;
    }
    return true;
  });
  const steps = [];
  list.forEach((ex) => {
    if (ex.type === 'warmup') {
      buildWarmupSteps(ex).forEach((s) => steps.push(s));
    } else if (ex.type === 'resistance') {
      buildResistanceSteps(ex).forEach((s) => steps.push(s));
    } else {
      buildStretchSteps(ex).forEach((s) => steps.push(s));
    }
  });
  steps.push({
    type: 'complete',
    tts: '训练结束。本次训练完成，辛苦了。',
    exerciseName: null,
    exerciseId: null,
    setNumber: null,
    totalSets: null,
    phaseType: 'complete',
    countsTowardResistance: false
  });
  return steps;
}
