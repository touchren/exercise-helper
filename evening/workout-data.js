/**
 * workout-data.js
 * 饭后半小时后20分钟锻炼：运动定义 + 步骤序列构建器。
 * 全局暴露：DEFAULT_EXERCISES、DEFAULT_SETTINGS、buildStepSequence、WORKOUT_META
 */

const DEFAULT_EXERCISES = [
  {
    id: 'cat-cow',
    name: '猫牛流动',
    type: 'warmup',
    cycles: 8,
    cycleSec: 5,
    breathing: true,
    restAfterSec: 0,
    intro: '四点跪撑，双手在肩正下方、双膝在髋正下方。弓背吸气，塌腰呼气，缓慢活动整条脊柱，作为基础热身。',
    tips: '弓背吸气、塌腰呼气；缓慢活动整条脊柱'
  },
  {
    id: 'wall-angel',
    name: '靠墙天使',
    type: 'resistance',
    sets: 1,
    reps: 15,
    repSec: 3,
    restAfterSec: 0,
    countsAsResistance: false,
    sides: null,
    intro: '后背、后脑勺、臀部贴墙，双脚离墙约10厘米。手臂弯曲90度贴墙，缓慢向上滑动再落下。全程保持下背贴墙，不要耸肩、不要挺腰。',
    tips: '后背贴墙，手臂90度贴墙滑动；下背贴墙，不耸肩不挺腰'
  },
  {
    id: 'eccentric-pullup',
    name: '单杠离心下放',
    type: 'resistance',
    sets: 3,
    reps: 3,
    repSec: 8,
    restSec: 45,
    sides: null,
    intro: '跳上单杠，握距略宽于肩，核心收紧保持身体稳定。匀速缓慢下放身体，控制3到5秒落至最低点。全程不要塌腰晃荡、不要用腰腹摆动借力。',
    tips: '跳上单杠，缓慢下放3-5秒；核心收紧，不塌腰不晃荡'
  },
  {
    id: 'doorframe-stretch',
    name: '门框胸肩拉伸',
    type: 'stretch',
    rounds: [{ holdSec: 20, restSec: 15 }, { holdSec: 40, restSec: 0 }],
    sides: null,
    intro: '前臂贴门框，手肘与肩同高。向前迈一步，胸口向前打开，感受胸肩前侧牵拉。不要耸肩、不要过度挺腰。',
    tips: '前臂贴门框，手肘与肩同高；胸口打开，不耸肩不挺腰'
  },
  {
    id: 'bodyweight-squat',
    name: '自重深蹲',
    type: 'resistance',
    sets: 3,
    reps: 12,
    repSec: 5,
    restSec: 30,
    sides: null,
    intro: '双脚与肩同宽，脚尖微向外。臀部向后坐，膝盖与脚尖同向。腰背挺直，上半身轻微前倾为正常，请勿弯腰驼背塌腰。蹲至大腿接近平行地面即可。',
    tips: '双脚与肩同宽，臀部后坐；腰背挺直，膝盖与脚尖同向'
  },
  {
    id: 'standing-quad-stretch',
    name: '站立股四头肌拉伸',
    type: 'stretch',
    holdSec: 30,
    sides: ['left', 'right'],
    restAfterSec: 0,
    intro: '单脚站立，同侧手抓脚踝，膝盖向后指向地面。骨盆保持中立，不要前倾、不要歪胯。感受大腿前侧牵拉，扶墙保持平衡。',
    tips: '同侧手抓脚踝，膝盖向后；骨盆中立，不前倾不歪胯'
  },
  {
    id: 'bird-dog',
    name: '鸟狗式',
    type: 'resistance',
    sets: 3,
    repsPerSide: 10,
    repSec: 4,
    restSec: 30,
    sides: ['left', 'right'],
    intro: '四点支撑，腰背保持平直。对侧手脚同步缓慢伸展，至与背部齐平即可，不要抬太高。全程骨盆不歪斜、腰椎不塌陷，核心持续收紧。',
    tips: '对侧手脚同步伸展，至与背部齐平；骨盆不歪斜，核心收紧'
  },
  {
    id: 'balasana',
    name: '婴儿式',
    type: 'stretch',
    holdSec: 40,
    sides: null,
    doneAnnounce: false,
    intro: '双膝分开与髋同宽，臀部缓慢坐向脚跟。上身前趴，额头贴垫，手臂向前放松。彻底放松腰背、髋部，平缓呼吸收尾。',
    tips: '双膝与髋同宽，臀部坐向脚跟；额头贴垫，放松腰背髋部'
  }
];

const DEFAULT_SETTINGS = {
  rate: 1.0,
  volume: 1.0,
  beepBeforeEnd: 5,
  ambient: {
    enabled: true,
    type: 'beat',
    volume: 0.3
  },
  exercises: DEFAULT_EXERCISES
};

const WORKOUT_META = {
  title: '饭后半小时后20分钟锻炼',
  totalSec: 20 * 60
};

function restText(setNumber, restSec) {
  return `第${setNumber}组完成，休息${restSec}秒。`;
}

function resistanceAnnounceText(ex, setNumber) {
  const isPerSide = ex.id === 'bird-dog';
  const count = isPerSide ? `${ex.repsPerSide}次每侧` : `${ex.reps}次`;
  const setPart = ex.sets > 1 ? `第${setNumber}组，共${ex.sets}组，` : '';
  const sideHint = isPerSide ? '先左侧。' : '';
  return `${ex.name}，${setPart}${count}。${ex.intro}${sideHint}`;
}

function countRepsStep(ex, setNumber, side) {
  const sideName = side === 'left' ? '左侧' : side === 'right' ? '右侧' : null;
  const count = ex.repsPerSide || ex.reps;
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
    countsTowardResistance: ex.countsAsResistance !== false,
    tips: ex.tips
  };
}

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

function interExerciseRestStep(ex) {
  return {
    type: 'rest',
    tts: `${ex.name}完成，休息${ex.restAfterSec}秒。`,
    duration: ex.restAfterSec,
    exerciseName: ex.name,
    exerciseId: ex.id,
    setNumber: null,
    totalSets: null,
    phaseType: 'rest',
    countsTowardResistance: false
  };
}

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
    steps.push({
      type: 'countdown',
      tokens: ['3', '2', '1', '开始'],
      duration: 4,
      exerciseName: ex.name,
      exerciseId: ex.id,
      setNumber: set,
      totalSets: ex.sets,
      phaseType: 'resistance'
    });

    if (ex.sides) {
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
        countsTowardResistance: ex.countsAsResistance !== false
      });
      steps.push(countRepsStep(ex, set, 'right'));
    } else {
      steps.push(countRepsStep(ex, set, null));
    }

    if (set < ex.sets) {
      steps.push(restStep(ex, set));
    }
  }

  if (ex.restAfterSec && ex.restAfterSec > 0) {
    steps.push({
      type: 'announce',
      tts: `${ex.name}完成。`,
      exerciseName: ex.name,
      exerciseId: ex.id,
      setNumber: null,
      totalSets: null,
      phaseType: 'resistance',
      countsTowardResistance: false
    });
    steps.push(interExerciseRestStep(ex));
  }

  return steps;
}

function buildStretchSteps(ex) {
  const steps = [];

  if (ex.rounds) {
    steps.push({
      type: 'announce',
      tts: `${ex.name}。${ex.intro}`,
      exerciseName: ex.name,
      exerciseId: ex.id,
      setNumber: null,
      totalSets: null,
      phaseType: 'stretch',
      countsTowardResistance: false
    });

    ex.rounds.forEach((round, idx) => {
      steps.push({
        type: 'countdown',
        tokens: idx === 0 ? ['3', '2', '1', '开始'] : ['3', '2', '1', '开始'],
        duration: 4,
        exerciseName: ex.name,
        exerciseId: ex.id,
        phaseType: 'stretch'
      });
      steps.push(holdStep(ex, null, idx, round.holdSec));
      if (round.restSec > 0 && idx < ex.rounds.length - 1) {
        steps.push({
          type: 'rest',
          tts: `休息${round.restSec}秒。`,
          duration: round.restSec,
          exerciseName: ex.name,
          exerciseId: ex.id,
          setNumber: null,
          totalSets: null,
          phaseType: 'rest',
          countsTowardResistance: false
        });
      }
    });

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
    return steps;
  }

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
  steps.push({
    type: 'countdown',
    tokens: ['3', '2', '1', '开始'],
    duration: 4,
    exerciseName: ex.name,
    exerciseId: ex.id,
    phaseType: 'stretch'
  });

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

function holdStep(ex, side, sideIndex, overrideSec) {
  const duration = overrideSec != null ? overrideSec : ex.holdSec;
  return {
    type: 'hold',
    tts: null,
    duration,
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
  steps.push({
    type: 'countdown',
    tokens: ['准备', '3', '2', '1', '开始'],
    duration: 5,
    exerciseName: ex.name,
    exerciseId: ex.id,
    phaseType: 'warmup'
  });
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
  if (ex.restAfterSec && ex.restAfterSec > 0) {
    steps.push(interExerciseRestStep(ex));
  }
  return steps;
}

function buildStepSequence(exercises, settings) {
  const mode = (settings && settings.mode) || 'full';
  const list = (exercises || DEFAULT_EXERCISES).filter((ex) => {
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
