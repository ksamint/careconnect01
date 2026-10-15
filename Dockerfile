# Deploy the locally verified frontend bundle, matching the existing release workflow.
FROM public.ecr.aws/docker/library/nginx:1.28-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY h5/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/api/health || exit 1
CMD ["nginx", "-g", "daemon off;"]
