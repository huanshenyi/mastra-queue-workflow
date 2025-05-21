FROM public.ecr.aws/lambda/nodejs:20

# Install Lambda Web Adapter
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.0 /lambda-adapter /opt/extensions/lambda-adapter

# Set working directory
WORKDIR /var/task

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all source code except the iac directory
COPY . .

# Build the application
RUN npm run build

# Set environment variables for Lambda Web Adapter
ENV AWS_LWA_PORT=4111
ENV AWS_LWA_READINESS_CHECK_PATH=/api
EXPOSE 4111
# Command to run the application
CMD ["node", ".mastra/output/index.mjs"]
