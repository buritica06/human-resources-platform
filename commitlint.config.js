export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'build', 'ci', 'perf', 'revert']],
    'subject-max-length': [2, 'always', 100],
  },
};
