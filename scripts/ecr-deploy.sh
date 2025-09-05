#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/ecr-deploy.sh [tag]
# Example: ./scripts/ecr-deploy.sh latest

REGISTRY="766670502987.dkr.ecr.ap-southeast-1.amazonaws.com"
REPO="miss-baguio-tabulation"
IMAGE_NAME="$REGISTRY/$REPO"
if [[ ${1:-} == "--help" || ${1:-} == "-h" ]]; then
  echo "Usage: $0 [tag]"
  echo "Example: $0 latest"
  exit 0
fi

TAG="${1:-latest}"
AWS_REGION="ap-southeast-1"

echo "ECR deploy: image=$IMAGE_NAME:$TAG region=$AWS_REGION"

command -v docker >/dev/null 2>&1 || { echo "docker not found in PATH" >&2; exit 1; }
command -v aws >/dev/null 2>&1 || { echo "aws CLI not found in PATH" >&2; exit 1; }

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Building Docker image..."
docker build -t "$IMAGE_NAME:$TAG" -f "$ROOT_DIR/Dockerfile" "$ROOT_DIR"

echo "Logging into ECR ($AWS_REGION)..."
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY"

echo "Ensuring ECR repository exists..."
if ! aws ecr describe-repositories --repository-names "$REPO" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo "Repository $REPO not found in $AWS_REGION — creating..."
  aws ecr create-repository --repository-name "$REPO" --region "$AWS_REGION" >/dev/null
  echo "Repository created."
else
  echo "Repository exists."
fi

echo "Pushing image: $IMAGE_NAME:$TAG"
docker push "$IMAGE_NAME:$TAG"

echo "Done. Pushed $IMAGE_NAME:$TAG"
