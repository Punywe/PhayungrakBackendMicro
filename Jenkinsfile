pipeline {
    agent any

    environment {
        VAULT_ADDR    = "https://Vault:8200"
        VAULT_RESOLVE = "Vault:8200:127.0.0.1"
        VAULT_CACERT  = credentials('VAULT_CACERT')
        VAULT_MOUNT   = "phayungrak"
        VAULT_ENV     = "production"
        VAULT_PATH    = "backend"

        COMPOSE_PROJECT   = 'payoongrak_backend'
        COMPOSE_FILE_PATH = 'docker-compose.yml'
        API_HEALTH_URL    = 'http://127.0.0.1:13000/api/health'

        DOCKER_BUILDKIT          = "1"
        COMPOSE_DOCKER_CLI_BUILD = "1"
    }

    stages {
        stage('Check Branch') {
            steps {
                script {
                    def branch = env.BRANCH_NAME ?: env.GIT_BRANCH ?: sh(
                        script: 'git rev-parse --abbrev-ref HEAD',
                        returnStdout: true
                    ).trim()
                    branch = branch.replaceFirst(/^(refs\/heads\/|refs\/remotes\/)?origin\//, '')

                    echo "Current branch: ${branch}"

                    if (branch != 'main') {
                        error("Pipeline aborted: Deployment is only supported on the 'main' branch (Current branch: ${branch})")
                    }
                }
            }
        }

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Fetch Secrets from Vault') {
            steps {
                withCredentials([string(credentialsId: 'VAULT_TOKEN', variable: 'VAULT_TOKEN')]) {
                    sh '''
                        set -e
                        umask 077   # env files must stay readable only by jenkins

                        if [ ! -r "$VAULT_CACERT" ]; then
                            echo "ERROR: cannot read CA cert at $VAULT_CACERT"
                            exit 1
                        fi

                        _resp="$WORKSPACE/vault_backend.json"
                        _dest="$WORKSPACE/.env"

                        _url_v2="$VAULT_ADDR/v1/$VAULT_MOUNT/data/$VAULT_ENV/$VAULT_PATH"
                        _url_v1="$VAULT_ADDR/v1/$VAULT_MOUNT/$VAULT_ENV/$VAULT_PATH"

                        echo "Fetching secrets from Vault..."
                        _status=$(curl -sS --cacert "$VAULT_CACERT" --resolve "$VAULT_RESOLVE" \
                            -H "X-Vault-Token: $VAULT_TOKEN" \
                            -o "$_resp" -w "%{http_code}" "$_url_v2" || echo "000")

                        if [ "$_status" != "200" ]; then
                            echo "KV v2 endpoint returned HTTP $_status. Retrying with KV v1 endpoint ($_url_v1)..."
                            _status=$(curl -sS --cacert "$VAULT_CACERT" --resolve "$VAULT_RESOLVE" \
                                -H "X-Vault-Token: $VAULT_TOKEN" \
                                -o "$_resp" -w "%{http_code}" "$_url_v1" || echo "000")
                        fi

                        if [ "$_status" != "200" ]; then
                            echo "ERROR: Vault request failed with HTTP status $_status"
                            if [ -f "$_resp" ]; then
                                cat "$_resp"
                            fi
                            exit 1
                        fi

                        # Accept both KV v1 and KV v2 payload shapes.
                        jq -e '((.data.data // .data // {}) | type) == "object"' "$_resp" >/dev/null || {
                            echo "ERROR: unexpected Vault payload at $_resp"
                            sed -E 's/(X-Vault-Token:|token=|password=)[^[:space:]]+/\\1[REDACTED]/g' "$_resp"
                            exit 1
                        }

                        jq -r '((.data.data // .data // {}) | to_entries[] | (.key + "=" + (.value|tostring)))' \
                            "$_resp" > "$_dest"

                        [ -s "$_dest" ] || { echo "ERROR: $_dest is empty after parsing Vault payload"; exit 1; }

                        echo "--- $_dest keys loaded (values hidden) ---"
                        grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' "$_dest"

                        rm -f "$_resp"
                    '''
                }
            }
        }

        stage('Build') {
            steps {
                sh 'docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE_PATH" build'
            }
        }

        stage('Deploy') {
            steps {
                sh '''
                    set -e
                    docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE_PATH" up -d --remove-orphans
                    docker image prune -f
                '''
            }
        }

        stage('Health Check') {
            steps {
                script {
                    echo "Checking health endpoint at ${env.API_HEALTH_URL}..."
                    retry(10) {
                        sleep(5)
                        def api = sh(
                            script: 'curl -sf "$API_HEALTH_URL" -o /dev/null -w \'%{http_code}\'',
                            returnStdout: true
                        ).trim()

                        if (api != '200') {
                            error("API health check failed — HTTP ${api}")
                        }
                        echo "Health check passed — API HTTP 200 OK"
                    }
                }
            }
        }

        stage('Verify') {
            steps {
                sh '''
                    echo "===== Container Status ====="
                    docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE_PATH" \
                        ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
                '''
            }
        }
    }

    post {
        success {
            echo "Successfully deployed payoongrak-backend on main branch!"
        }
        failure {
            echo "Pipeline failed on main branch deployment."
        }
        always {
            sh 'rm -f "$WORKSPACE/.env" "$WORKSPACE"/vault_*.json || true'
            cleanWs()
        }
    }
}
