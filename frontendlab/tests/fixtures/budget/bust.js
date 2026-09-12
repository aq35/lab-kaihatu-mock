// 梯子違反: 1 関数のために lodash 全体を引き込む（EXP-3 の 753x 事故）。
// ゲートはこれを bytes で捕まえて build を止める。
import _ from 'lodash';
export const onResize = _.debounce(() => {}, 100);
