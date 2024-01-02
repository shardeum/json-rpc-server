.PHONY: *

DOCKER_IMAGE = shardeum-json-rpc
APP_NAME = shardeum-json-rpc-server

# Build the Docker image
build:
	docker build -t $(DOCKER_IMAGE) .

# Run the Docker container
run:
	docker run -d --name $(APP_NAME) $(DOCKER_IMAGE)

# Stop the Docker container
stop:
	docker stop $(APP_NAME)
	docker rm $(APP_NAME)

# Clean up Docker images
clean:
	docker rmi $(DOCKER_IMAGE)