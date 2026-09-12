import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  courseSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Setup',
      items: ['setup/prerequisites', 'setup/environment'],
    },
    {
      type: 'category',
      label: "M1 · The ML Lifecycle and the Project",
      items: ['m1-ml-lifecycle-and-project/lesson', 'm1-ml-lifecycle-and-project/quiz', 'm1-ml-lifecycle-and-project/deep-dive'],
    },
    {
      type: 'category',
      label: "M2 · Environment Setup",
      items: ['m2-environment-setup/lesson', 'm2-environment-setup/lab', 'm2-environment-setup/quiz', 'm2-environment-setup/deep-dive'],
    },
    {
      type: 'category',
      label: "M3 · From Data to Model",
      items: ['m3-data-to-model/lesson', 'm3-data-to-model/lab', 'm3-data-to-model/quiz', 'm3-data-to-model/deep-dive'],
    },
    {
      type: 'category',
      label: "M4 · Packaging and Serving",
      items: ['m4-package-and-serve/lesson', 'm4-package-and-serve/lab', 'm4-package-and-serve/quiz', 'm4-package-and-serve/deep-dive'],
    },
    {
      type: 'category',
      label: "M5 · CI Pipelines with GitHub Actions",
      items: ['m5-ci-pipelines/lesson', 'm5-ci-pipelines/lab', 'm5-ci-pipelines/quiz', 'm5-ci-pipelines/deep-dive'],
    },
    {
      type: 'category',
      label: "M6 · Deploying on Kubernetes",
      items: ['m6-deploy-on-kubernetes/lesson', 'm6-deploy-on-kubernetes/lab', 'm6-deploy-on-kubernetes/quiz', 'm6-deploy-on-kubernetes/deep-dive'],
    },
    {
      type: 'category',
      label: "M7 · Monitoring and Autoscaling",
      items: ['m7-monitoring-and-autoscaling/lesson', 'm7-monitoring-and-autoscaling/lab', 'm7-monitoring-and-autoscaling/lab-autoscaling', 'm7-monitoring-and-autoscaling/quiz', 'm7-monitoring-and-autoscaling/deep-dive'],
    },
    {
      type: 'category',
      label: "M8 · GitOps with Argo CD",
      items: ['m8-gitops-with-argocd/lesson', 'm8-gitops-with-argocd/lab', 'm8-gitops-with-argocd/quiz', 'm8-gitops-with-argocd/deep-dive'],
    },
    {
      type: 'category',
      label: "M9 · Progressive Delivery for Models",
      items: ['m11-progressive-delivery/lesson', 'm11-progressive-delivery/lab', 'm11-progressive-delivery/lab-metric-gates', 'm11-progressive-delivery/lab-environments', 'm11-progressive-delivery/quiz', 'm11-progressive-delivery/deep-dive'],
    },
    {
      type: 'category',
      label: "M10 · Drift Detection and Retraining",
      items: ['m12-drift-and-retraining/lesson', 'm12-drift-and-retraining/lab', 'm12-drift-and-retraining/lab-closed-loop', 'm12-drift-and-retraining/quiz', 'm12-drift-and-retraining/deep-dive'],
    },
    {
      type: 'category',
      label: "Appendix A · MLOps Foundations",
      items: ['m9-mlops-foundations/lesson', 'm9-mlops-foundations/quiz', 'm9-mlops-foundations/deep-dive'],
    },
    {
      type: 'category',
      label: "Appendix B · ML Algorithms",
      items: ['m10-ml-algorithms/lesson', 'm10-ml-algorithms/quiz', 'm10-ml-algorithms/deep-dive'],
    },
  ],
};

export default sidebars;
