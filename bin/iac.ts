import * as cdk from 'aws-cdk-lib';
import { IacStack } from '../lib/iac-stack';

const app = new cdk.App();
new IacStack(app, 'IacStack', {
    tags: {
        Application: 'Mastra',
        Environment: 'Production',
    }
});