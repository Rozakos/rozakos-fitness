// Self-hosted CI for rozakos-fitness, running on the Jenkins controller in the
// homelab (Debian LXC on the Proxmox box).
//
// This deliberately mirrors .github/workflows/verify.yml rather than replacing
// it. Both run; GitHub Actions is free on a public repo and catches pushes from
// the other environment, and this one runs on hardware we control. If the two
// ever disagree, that disagreement is itself information — most likely a
// toolchain difference worth knowing about.
//
// Known environment difference: GitHub Actions pins Python 3.12 (matching the
// dev box); this controller runs Debian 13's Python 3.13. The backend suite
// passes on both, which is a small bonus signal.

pipeline {
  agent any

  options {
    timestamps()
    timeout(time: 30, unit: 'MINUTES')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    EXPO_NO_TELEMETRY = '1'
    CI = 'true'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        sh 'git --no-pager log -1 --oneline'
      }
    }

    stage('Backend tests') {
      steps {
        // Debian 13 enforces PEP 668, so a system-wide pip install is refused.
        // The venv is per-build; the workspace is wiped by cleanWs() anyway.
        sh '''
          python3 -m venv .venv
          .venv/bin/pip install --quiet --upgrade pip
          .venv/bin/pip install --quiet -r backend/requirements.txt
          cd backend && ../.venv/bin/python -m pytest tests -q
        '''
        // Also covers test_catalog_sync.py, which asserts backend/app/seed.py
        // and mobile/src/local/catalog.ts still describe the same exercises.
      }
    }

    stage('Mobile install') {
      steps {
        // mobile/ ships without eslint in node_modules after a fresh clone.
        sh 'cd mobile && npm ci --no-audit --no-fund'
      }
    }

    stage('Typecheck') {
      steps {
        sh 'cd mobile && npx tsc --noEmit'
      }
    }

    stage('Lint') {
      steps {
        sh 'cd mobile && npx expo lint'
      }
    }

    stage('Local-mode parity') {
      steps {
        // mobile/src/local/api.ts reimplements the whole REST surface on-phone
        // for local-only mode and has no test runner of its own. This compiles
        // it to CommonJS, stubs react-native, and holds it to the same
        // behaviour the backend tests assert — including the no-aliasing rule
        // that caused the v1.6 invisible-set bug.
        sh 'node scripts/check-local-mode.mjs'
      }
    }
  }

  post {
    cleanup {
      cleanWs()
    }
  }
}
